"""Download the Manrope variable font (latin subset) from Google Fonts as woff2,
plus its OFL licence, into src/assets/fonts/. Run once; the output is committed.

    python3 -I scripts/fetch_font.py
"""
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "src", "assets", "fonts")
CSS_URL = "https://fonts.googleapis.com/css2?family=Manrope:wght@500..800&display=swap"
OFL_URL = "https://raw.githubusercontent.com/google/fonts/main/ofl/manrope/OFL.txt"
# A modern browser UA makes Google serve woff2 with per-subset blocks.
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"


def get(url: str) -> bytes:
    # curl rather than urllib: the python.org Python on this Mac has no CA bundle,
    # curl uses the system keychain.
    return subprocess.run(
        ["curl", "-fsSL", "--max-time", "30", "-A", UA, url],
        check=True,
        capture_output=True,
    ).stdout


def main() -> int:
    css = get(CSS_URL).decode("utf-8")
    m = re.search(r"/\* latin \*/\s*@font-face\s*{[^}]*?url\((https://[^)]+\.woff2)\)", css, re.S)
    if not m:
        print("could not find the latin woff2 block in the Google Fonts CSS", file=sys.stderr)
        return 1
    os.makedirs(OUT, exist_ok=True)
    font = get(m.group(1))
    with open(os.path.join(OUT, "Manrope.woff2"), "wb") as f:
        f.write(font)
    with open(os.path.join(OUT, "OFL.txt"), "wb") as f:
        f.write(get(OFL_URL))
    print(f"Manrope.woff2: {len(font) / 1024:.1f} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
