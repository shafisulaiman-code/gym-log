"""Build the technique drawings: for every seed exercise in VISUALS, fetch the
Everkinetic frames from Wikimedia Commons (rendered to PNG by Commons), recolour
them for the dark theme, trim to the figure and write public/visuals/<id>-<n>.webp.
Also writes visualId / visualFrames into src/data/seed.json so the mapping below
is the single source of truth, and public/visuals/ATTRIBUTION.md for the licence.

    python3 -I scripts/fetch_visuals.py [--force]

Developer-side, run once; the output is committed. Needs Pillow:
    pip3 install --user pillow
Drawings © Everkinetic, CC BY-SA 3.0; the WebP files are derivatives under the
same licence. Exercises not listed keep a placeholder.
"""
import json
import os
import re
import subprocess
import sys
import time
import urllib.parse
from io import BytesIO

try:
    from PIL import Image, ImageChops
except ImportError:  # pragma: no cover
    print("Pillow is missing. Install it with:  pip3 install --user pillow", file=sys.stderr)
    sys.exit(1)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEED = os.path.join(ROOT, "src", "data", "seed.json")
OUT = os.path.join(ROOT, "public", "visuals")
API = "https://commons.wikimedia.org/w/api.php"
UA = "gym-log visuals script (https://github.com/shafisulaiman-code/gym-log)"
RENDER_WIDTH = 960  # Commons renders SVGs to PNG at this width
MAX_SIDE = 720  # output long side, px
MIN_SIDE = 600  # refuse sources smaller than this: they pixelate on a phone
WHITE = 235  # for sources without an alpha channel: channels above this are background
PAD = 0.06
LINE = (232, 232, 236)  # drawing lines on the dark theme
FILL = (20, 20, 24)  # figure fill, the card colour
BUDGET_BYTES = 5 * 1024 * 1024

# exercise id -> Commons file titles, start then end position. Proxies are noted.
VISUALS: dict[str, list[str]] = {
    "kb-goblet-squat": ["File:Pile squat with dumbbell 1.svg", "File:Pile squat with dumbbell 2.svg"],  # proxy
    "kb-sa-press": ["File:One-arm-shoulder-press-1.png", "File:One-arm-shoulder-press-2.png"],  # proxy: dumbbell
    "kb-deadlift": ["File:Dumbbell dead lifts 1.svg", "File:Dumbbell dead lifts 2.svg"],  # proxy: dumbbells
    "m-leg-press": ["File:Leg-press-1-1024x670.png", "File:Leg-press-2-1024x670.png"],
    "m-chest-press": ["File:Machine bench press 1.svg", "File:Machine bench press 2.svg"],
    "m-lat-pulldown": ["File:Underhand pull down 1.svg", "File:Underhand pull down 2.svg"],  # proxy: underhand grip; the wide-grip files are a start frame plus 172 px GIFs
    "m-seated-row": ["File:Seated cable rows 1.svg", "File:Seated cable rows 2.svg"],  # proxy: cable
    "m-shoulder-press": ["File:Seated shoulder press machine 1.svg", "File:Seated shoulder press machine 2.svg"],
    "m-leg-curl": ["File:Seated leg curl 1.svg", "File:Seated leg curl 2.svg"],
    "m-leg-extension": ["File:Leg extensions 1.svg", "File:Leg extensions 2.svg"],
    "m-pec-fly-rear-delt": ["File:Butterfly machine 1.svg", "File:Butterfly machine 2.svg"],
    "m-hip-abd-add": ["File:Thigh abductor 1.svg"],  # seated machine; only one large frame exists, so a still
    "c-cable-row": ["File:Seated cable rows 1.svg", "File:Seated cable rows 2.svg"],
    "c-face-pull": ["File:Seated rear lateral cable raise 1.svg", "File:Seated rear lateral cable raise 2.svg"],  # proxy
    "c-tricep-pushdown": ["File:Triceps pushdown with rope and cable 1.svg", "File:Triceps pushdown with rope and cable 2.svg"],
    "db-rdl": ["File:Romanian dead lift 1.svg", "File:Romanian dead lift 2.svg"],
    "db-bench": ["File:Bench press dumbbell 1.svg", "File:Bench press dumbbell 2.svg"],
    "db-split-squat": ["File:Lunges-1.png", "File:Lunges-2.png"],  # proxy: barbell lunge
    "db-shoulder-press": ["File:Dumbbell shoulder press 1.svg", "File:Dumbbell shoulder press 2.svg"],
    "bb-deadlift": ["File:Barbell dead lifts 1.svg", "File:Barbell dead lifts 2.svg"],
    "core-back-extension": ["File:Hyperextensions 1.svg", "File:Hyperextensions 2.svg"],
}


def curl(url: str) -> bytes:
    # curl rather than urllib: the python.org Python on this Mac has no CA bundle.
    for attempt in range(5):
        r = subprocess.run(["curl", "-fsSL", "-A", UA, "--max-time", "60", url], capture_output=True)
        if r.returncode == 0:
            time.sleep(0.3)
            return r.stdout
        time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"could not fetch {url}: {r.stderr.decode(errors='replace').strip()}")


def image_info(titles: list[str]) -> dict[str, dict]:
    """Commons imageinfo for each title: rendered URL and licence fields."""
    info: dict[str, dict] = {}
    for i in range(0, len(titles), 50):
        chunk = titles[i : i + 50]
        q = urllib.parse.urlencode(
            {
                "action": "query",
                "prop": "imageinfo",
                "iiprop": "url|mime|extmetadata",
                "iiextmetadatafilter": "LicenseShortName|Artist|LicenseUrl",
                "iiurlwidth": RENDER_WIDTH,
                "format": "json",
                "titles": "|".join(chunk),
            }
        )
        data = json.loads(curl(f"{API}?{q}"))
        back = {n["to"]: n["from"] for n in data["query"].get("normalized", [])}
        for page in data["query"]["pages"].values():
            if "imageinfo" not in page:
                raise RuntimeError(f"no such file on Commons: {page['title']}")
            ii = page["imageinfo"][0]
            meta = ii.get("extmetadata", {})
            info[back.get(page["title"], page["title"])] = {
                "url": ii.get("thumburl") or ii["url"],
                "page": ii["descriptionurl"],
                "mime": ii["mime"],
                "licence": meta.get("LicenseShortName", {}).get("value", "?"),
                "licence_url": meta.get("LicenseUrl", {}).get("value", ""),
                "artist": meta.get("Artist", {}).get("value", "?"),
            }
    return info


def key_white(im: Image.Image) -> Image.Image:
    r, g, b, _ = im.split()
    darkest = ImageChops.darker(ImageChops.darker(r, g), b)
    im.putalpha(darkest.point(lambda v: 0 if v > WHITE else 255))
    return im


def recolour(im: Image.Image) -> Image.Image:
    """Black lines on white fill become light lines on a dark fill, alpha kept."""
    im = im.convert("RGBA")
    if im.getchannel("A").getextrema()[0] == 255:
        im = key_white(im)
    lum = im.convert("L")  # 0 = line, 255 = fill
    out = Image.new("RGBA", im.size)
    bands = []
    for c in range(3):
        bands.append(lum.point(lambda v, c=c: round(FILL[c] + (LINE[c] - FILL[c]) * (255 - v) / 255)))
    out = Image.merge("RGB", bands).convert("RGBA")
    out.putalpha(im.getchannel("A"))
    return out


def normalise(frames: list[Image.Image]) -> list[Image.Image]:
    """Frames of one drawing can come from different renders; put them on one
    scale, crop to the union of the figures so nothing jumps, cap the size."""
    width = max(f.width for f in frames)
    frames = [f if f.width == width else f.resize((width, round(f.height * width / f.width)), Image.LANCZOS) for f in frames]
    height = max(f.height for f in frames)
    padded = []
    for f in frames:
        canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        canvas.paste(f, (0, 0))
        padded.append(canvas)
    box = None
    for f in padded:
        b = f.getchannel("A").getbbox()
        if b:
            box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
    if box:
        w, h = box[2] - box[0], box[3] - box[1]
        px, py = int(w * PAD), int(h * PAD)
        box = (max(0, box[0] - px), max(0, box[1] - py), min(width, box[2] + px), min(height, box[3] + py))
        padded = [f.crop(box) for f in padded]
    long = max(padded[0].size)
    if long > MAX_SIDE:
        s = MAX_SIDE / long
        padded = [f.resize((round(f.width * s), round(f.height * s)), Image.LANCZOS) for f in padded]
    return padded


def stem(title: str) -> str:
    """'File:Leg-press-1-1024x670.png' -> 'Leg press'."""
    name = title.removeprefix("File:").rsplit(".", 1)[0].replace("-", " ")
    name = re.sub(r"\s+\d+x\d+$", "", name)
    return re.sub(r"\s+\d+$", "", name)


def write_seed(seed: dict) -> None:
    for ex in seed["exercises"]:
        titles = VISUALS.get(ex["id"])
        rebuilt = {}
        for k, v in ex.items():
            if k == "visualFrames":
                continue
            if k == "visualId":
                rebuilt["visualId"] = stem(titles[0]) if titles else None
                rebuilt["visualFrames"] = len(titles) if titles else 0
            else:
                rebuilt[k] = v
        ex.clear()
        ex.update(rebuilt)
    with open(SEED, "w") as f:
        json.dump(seed, f, indent=2, ensure_ascii=False)
        f.write("\n")


def main() -> int:
    seed = json.load(open(SEED))
    ids = {ex["id"] for ex in seed["exercises"]}
    unknown = set(VISUALS) - ids
    if unknown:
        print(f"VISUALS names exercises not in the seed: {sorted(unknown)}", file=sys.stderr)
        return 1
    os.makedirs(OUT, exist_ok=True)
    for name in os.listdir(OUT):  # drop files no longer produced (old single-file animations)
        if name.endswith(".webp") and not re.fullmatch(r".+-\d\.webp", name):
            os.remove(os.path.join(OUT, name))
    titles = sorted({t for ts in VISUALS.values() for t in ts})
    info = image_info(titles)
    rendered: dict[str, Image.Image] = {}
    total = 0
    lines = [
        "# Technique drawings",
        "",
        "Every file in this folder is a derivative (recoloured for the dark theme, cropped, converted to WebP) of a drawing by Everkinetic, published on Wikimedia Commons under CC BY-SA 3.0 (https://creativecommons.org/licenses/by-sa/3.0/). The derivatives are available under the same licence. Built by scripts/fetch_visuals.py.",
        "",
        "| Exercise | Frame | Source | Licence |",
        "|---|---|---|---|",
    ]
    for ex in seed["exercises"]:
        ts = VISUALS.get(ex["id"])
        if not ts:
            continue
        paths = [os.path.join(OUT, f"{ex['id']}-{n + 1}.webp") for n in range(len(ts))]
        for n, t in enumerate(ts):
            meta = info[t]
            lines.append(f"| {ex['name']} | {n + 1} | [{t.removeprefix('File:')}]({meta['page']}) | {meta['licence']}, {meta['artist']} |")
            if not meta["licence"].startswith("CC BY-SA"):
                print(f"{t}: unexpected licence {meta['licence']}", file=sys.stderr)
                return 1
        if all(os.path.exists(p) for p in paths) and "--force" not in sys.argv:
            size = sum(os.path.getsize(p) for p in paths)
            total += size
            print(f"{ex['id']:<26} already built {size / 1024:6.1f} KB")
            continue
        frames = []
        for t in ts:
            if t not in rendered:
                src = Image.open(BytesIO(curl(info[t]["url"])))
                if max(src.size) < MIN_SIDE:
                    print(f"{t}: source is only {src.size[0]}x{src.size[1]} px, too small", file=sys.stderr)
                    return 1
                rendered[t] = recolour(src)
            frames.append(rendered[t].copy())
        frames = normalise(frames)
        size = 0
        for f, p in zip(frames, paths):
            f.save(p, format="WEBP", quality=80, method=6)
            size += os.path.getsize(p)
        total += size
        print(f"{ex['id']:<26} {stem(ts[0]):<40} {len(frames)} frames {frames[0].size} {size / 1024:6.1f} KB")
    with open(os.path.join(OUT, "ATTRIBUTION.md"), "w") as f:
        f.write("\n".join(lines) + "\n")
    write_seed(seed)
    print(f"\n{len(VISUALS)} drawings, {total / 1024 / 1024:.2f} MB total; seed.json updated")
    if total > BUDGET_BYTES:
        print("over the 5 MB budget", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
