# Handoff

Status as of 2026-10-31: Phase 1 is built and has been through one redesign pass after Shafi's first click-through. It is **not deployed** and has **not passed the acceptance test** in PLAN.md yet. The redesign work is in the working tree, uncommitted, by Shafi's instruction.

## What was built (Phase 1 + redesign)

- **Design**: "Fitness dark" system. Black background, one green accent, Manrope (self-hosted woff2, OFL), 56 px tap targets, bottom sheets with Android-back support. Spec: `docs/superpowers/specs/2026-10-31-phase1-redesign-design.md`. Plan: `docs/superpowers/plans/2026-10-31-phase1-redesign.md`.
- **Home**: date, outlet chips (two-column grid), Start/Resume, Cardio and Bodyweight, past workout cards, Export JSON (opens the export sheet).
- **Workout**: sticky header with outlet, elapsed time, "n of N sets" pill and progress strip. Exercise cards with a technique thumbnail, name, "Last" line, and a step pill on machines and cables (1.25 / 2.5 / 5 / 10 / custom). Set rows: W/number badge, weight control, reps or seconds, ✓. Ghost rows (faint, dashed) copy last session; ✓ or any edit makes them real. "+ Set" copies the last real row. Finish is at the bottom and opens a summary sheet.
- **Technique sheet**: tap the thumbnail or name. Muscles, rep range, load mode and caution pills, start/end line drawings that crossfade (side by side under reduced motion), cues, a CC BY-SA credit line, "Watch on YouTube" fallback.
- **Kettlebells**: scrollable bell chips (seed sizes plus any size ever ticked) and a "…" chip for a typed weight.
- **Finish sheet**: duration, sets, volume, per-exercise lines, warning about unticked sets, Keep going / Finish.
- **Exercise picker**: full-screen overlay with thumbnails; back closes it. Custom machine is a bottom sheet.
- **Cardio**: segmented control. 4x4 shows a session timeline, shared speed and incline, and a per-interval table (peak HR per row; tap a speed or incline cell to override that row). RPE chips. Prefill copies the plan and clears the measurements.
- **Bodyweight**: restyled, same behaviour.
- **Export**: sheet with file name and size, Share or download, Copy JSON, and a textarea fallback when copying is blocked (plain http).
- **Storage**: Dexie, schema version 2 (adds `SetRow.ghost`, `Exercise.cues`, `Exercise.visualId`, `Exercise.visualFrames`). No migration needed; seed rows are re-put on every start.
- **PWA**: manifest colours `#0b0b0d`; precache includes the font and the visuals.

## Where things are

- `src/nav.ts`, `src/useLayer.ts`: history layers so back closes sheets and overlays. `popAll()` leaves everything (used by Finish).
- `src/components/`: `BottomSheet`, `Stepper`, `BellChips`, `StepPill`, `Thumb`.
- `src/screens/`: one file per screen plus `FinishSheet`, `TechniqueSheet`, `ExportSheet`, `CustomMachineSheet`.
- Pure logic with tests: `history.ts` (prefill, countSets, distinctWeights), `summary.ts` (volume, finish summary), `cardio.ts` (timeline, shared overrides, prefill), `weights.ts` (parseWeight, bellSizes). Run `npm test`.
- `scripts/fetch_font.py`: downloads Manrope. `scripts/fetch_visuals.py`: builds `public/visuals/<id>-<n>.webp` from Everkinetic drawings on Wikimedia Commons, writes `ATTRIBUTION.md` and the seed's `visualId`/`visualFrames` (skips existing, `--force` to rebuild).
- Run locally: `npm install`, `npm run dev`, open http://localhost:5173/gym-log/ (the `/gym-log/` path matters). On the phone over Wi-Fi use the LAN address printed by Vite; downloads and clipboard are blocked there (plain http), which is expected.

## Technique visuals

Everkinetic line drawings (CC BY-SA 3.0, via Wikimedia Commons), two frames per exercise, recoloured light-on-dark. The first pass used the free ExerciseDB GIFs; Shafi found them too pixelated (180 px source) and chose the drawings on 31 Oct 2026. 21 of 31 seed exercises are covered. Proxies: Goblet Squat uses a plié squat with a dumbbell, Kettlebell Press a one-arm dumbbell press, Kettlebell Deadlift a dumbbell deadlift, Lat Pulldown an underhand pulldown (the wide-grip files on Commons are a start frame plus 172 px GIFs), machine Seated Row the seated cable row, Face Pull a seated rear lateral cable raise, Split Squat a barbell lunge. Hip Abductor / Adductor is a single still (only one large frame exists), so it does not animate. The script refuses sources under 600 px. No drawing (placeholder + YouTube): kettlebell swing, row, carry, clean, halo; Pallof press; dead bug; bird-dog; plank; hanging knee raise. The mapping is `VISUALS` in `scripts/fetch_visuals.py`; edit it and rerun to change one. Attribution lives in `public/visuals/ATTRIBUTION.md` and on the sheet.

## Decisions not spelled out in PLAN.md

- Finish deletes unticked and ghost rows; a workout with no ticked sets is deleted entirely.
- Reopening the app during an unfinished workout goes straight back to it.
- "− Set" removes the last row, ghost or real, but only if it isn't ticked.
- Kettlebell exercises with no history start at 12 kg; the current weight is always shown as a chip.
- Leg Press seed step is 2.5 kg; a machine that moves in 10 kg plates is corrected with the step pill.
- Volume on the finish sheet doubles per-hand loads, counts added kg only for bodyweight moves, ignores timed sets and warm-ups.
- Cardio prefill clears heart rates, RPE and note from the last session.
- Custom machines are stored as a new exercise (`custom: true`) plus one equipment row at the chosen outlet.
- One dark theme; no light mode.
- IDs use a small UUID helper rather than `crypto.randomUUID`, so the app also works over plain-http Wi-Fi during testing.

## Still to do

1. **Shafi's click-through of the redesign** on the phone over Wi-Fi.
2. **Deploy** to GitHub Pages (the workflow already exists; enable Pages in repo settings) once he says the click-through passed.
3. **Acceptance test** on the phone in airplane mode as an installed PWA, per PLAN.md.
4. Later: drawings for the ten uncovered exercises (another CC source, or commissioned in the same style); a paid animation pack only if the sheet earns its place.
