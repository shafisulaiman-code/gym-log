# Handoff

Status as of 2026-10-31 (evening): Phase 1 is built, redesigned, expanded (53 exercises) and **deployed to GitHub Pages** at https://shafisulaiman-code.github.io/gym-log/ after Shafi's phone click-through passed. Every push to `main` redeploys via `.github/workflows/deploy.yml`. The **airplane-mode acceptance test** in PLAN.md **passed** on Shafi's Android phone (Chrome, installed from the Pages link) on 31 Oct 2026: a workout logged offline and present after reconnecting. The one issue it surfaced, the outlet suggestion not returning after airplane mode, is fixed (`src/locate.ts`: a quick cached try, then a patient high-accuracy try, re-asked on foreground or network return).

## What was built (Phase 1 + redesign)

- **Design**: "Fitness dark" system. Black background, one green accent, Manrope (self-hosted woff2, OFL), 56 px tap targets, bottom sheets with Android-back support. Spec: `docs/superpowers/specs/2026-10-31-phase1-redesign-design.md`. Plan: `docs/superpowers/plans/2026-10-31-phase1-redesign.md`.
- **Home**: date, outlet chips (two-column grid), Start/Resume, Cardio and Bodyweight, past workout cards, Export JSON (opens the export sheet). **You are at**: on open, one low-power location fix (five-minute cache, eight-second timeout) picks the outlet within 1.5 km and preselects it with a green dot and a note, unless a workout is already open or Shafi has tapped a chip. Outlet coordinates live in `seed.json` (OneMap, 31 Oct 2026); logic in `src/geo.ts` (tested). The position never leaves the device and is not stored. Denied permission or no fix means no suggestion. Orchard Cineleisure and Orchard Gateway are 350 m apart, so a mall fix can pick the wrong one; the chips still work. When no known outlet is near (and no workout is open), a dashed **+ Add gym** chip opens a sheet: name it and it is saved as a new outlet (`AddOutletSheet`, `makeOutlet` in `geo.ts`), selected at once. With a position fix the coordinates are saved too, so it is recognised on later visits; without one (permission denied, or a plain-http dev origin where Safari blocks geolocation) it is saved by name alone. Added outlets are ordinary rows in `db.outlets`; the seed never deletes them. **Past workout cards open a session sheet** (`SessionSheet`): duration, sets, volume, each exercise with its sets and thumbnail, the note; cardio sessions show type, duration, speed, incline, heart rates and RPE (`cardioLines` in `src/sessionDetail.ts`, tested). "Delete workout" needs a second tap and removes the workout with its sets or cardio row.
- **Workout**: sticky header with outlet, elapsed time, "n of N sets" pill and progress strip. An **Up next dock** fixed to the bottom shows the next unticked set (exercise, set number, load × reps) with one 64 px ✓ that completes it; tapping the text scrolls to the card; when every set is ticked the dock becomes Finish. Logic in `src/nextSet.ts` (tested): first unticked row, exercises in the order added, rows by seq. A card whose every set is ticked **folds** to one line (thumbnail, name, sets, ✓) so the current exercise stays in view; tapping it pins it open for the session, and unticking or adding a set unfolds it (`cardFolded` in `src/fold.ts`, tested). Exercise cards with a technique thumbnail, name, "Last" line, and a step pill on machines and cables (1.25 / 2.5 / 5 / 10 / custom). Set rows: W/number badge, weight control, reps or seconds, ✓. Ghost rows (faint, dashed) copy last session; ✓ or any edit makes them real. "+ Set" copies the last real row. Finish is at the bottom and opens a summary sheet.
- **Technique sheet**: tap the thumbnail or name. Muscles, rep range, load mode and caution pills, start/end line drawings that crossfade (side by side under reduced motion), cues, a CC BY-SA credit line, "Watch on YouTube" fallback.
- **Kettlebells**: scrollable bell chips (seed sizes plus any size ever ticked) and a "…" chip for a typed weight.
- **Finish sheet**: duration, sets, volume, per-exercise lines, warning about unticked sets, Keep going / Finish.
- **Exercise picker**: full-screen overlay with thumbnails; back closes it. A muscle chip row (All, Chest, Back, Shoulders, Biceps, Triceps, Legs, Glutes, Core) under the search field: a chip shows one flat alphabetical list of every exercise hitting that muscle from any equipment type, gated ones with their note; All is the grouped view (Machine, Cable, Free weight, Kettlebell, Core, Plyo). Mapping in `src/muscles.ts` (tested). Custom machine is a bottom sheet.
- **Cardio**: segmented control. 4x4 shows a session timeline, shared speed and incline, and a per-interval table (peak HR per row; tap a speed or incline cell to override that row). RPE chips. Prefill copies the plan and clears the measurements.
- **Bodyweight**: restyled, same behaviour.
- **Export**: sheet with file name and size, Share or download, Copy JSON, and a textarea fallback when copying is blocked (plain http).
- **Storage**: Dexie, schema version 2 (adds `SetRow.ghost`, `Exercise.cues`, `Exercise.visualId`, `Exercise.visualFrames`). No migration needed; seed rows are re-put on every start and seed exercises that leave `seed.json` are pruned (`src/seedPrune.ts`). Set rows pointing at a pruned exercise are skipped by the Workout loader.
- **Library**: 53 seed exercises in six groups. 31 Oct 2026 expansion: Pec Fly and Rear Delt Fly replace the combined machine; 7 cable, 8 dumbbell and 6 plyo moves added. Box Jump uses `loadMode: 'height_cm'`: `weightKg` holds the box height in cm, the stepper and "Last" line say cm, volume ignores it, export shape unchanged (the exercise's loadMode tells a reader it is cm).
- **PWA**: manifest colours `#0b0b0d`; precache includes the font and the visuals.

## Where things are

- `src/nav.ts`, `src/useLayer.ts`: history layers so back closes sheets and overlays. `popAll()` leaves everything (used by Finish).
- `src/components/`: `BottomSheet`, `Stepper`, `BellChips`, `StepPill`, `Thumb`.
- `src/screens/`: one file per screen plus `FinishSheet`, `TechniqueSheet`, `ExportSheet`, `CustomMachineSheet`.
- Pure logic with tests: `history.ts` (prefill, countSets, distinctWeights), `summary.ts` (volume, finish summary), `cardio.ts` (timeline, shared overrides, prefill), `weights.ts` (parseWeight, bellSizes). Run `npm test`.
- `scripts/fetch_font.py`: downloads Manrope. `scripts/fetch_visuals.py`: builds `public/visuals/<id>-<n>.webp` from Everkinetic drawings on Wikimedia Commons, writes `ATTRIBUTION.md` and the seed's `visualId`/`visualFrames` (skips existing, `--force` to rebuild).
- Run locally: `npm install`, `npm run dev`, open http://localhost:5173/gym-log/ (the `/gym-log/` path matters). On the phone over Wi-Fi use the LAN address printed by Vite; downloads and clipboard are blocked there (plain http), which is expected.

## Technique visuals

Everkinetic line drawings (CC BY-SA 3.0, via Wikimedia Commons), two frames per exercise, recoloured light-on-dark. The first pass used the free ExerciseDB GIFs; Shafi found them too pixelated (180 px source) and chose the drawings on 31 Oct 2026. 32 of 53 seed exercises are covered. Proxies: Goblet Squat uses a plié squat with a dumbbell, Kettlebell Press a one-arm dumbbell press, Kettlebell Deadlift a dumbbell deadlift, Lat Pulldown an underhand pulldown, machine Seated Row the seated cable row, Face Pull a seated rear lateral cable raise, Split Squat a barbell lunge, Bulgarian Split Squat a barbell one-leg squat, Cable Crunch the seated version. Hip Abductor / Adductor is a single still. No drawing (placeholder + YouTube): kettlebell swing, row, carry, clean, halo; Pallof press; dead bug; bird-dog; plank; hanging knee raise; Rear Delt Fly; Cable Lateral Raise; Single-arm Cable Row; Cable Pull-through; One-arm Dumbbell Row; all six plyo moves. The mapping is `VISUALS` in `scripts/fetch_visuals.py`; edit it and rerun to change one (sources under 600 px are refused). Attribution lives in `public/visuals/ATTRIBUTION.md` and on the sheet.

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

1. Later: drawings for the 21 uncovered exercises (another CC source, or commissioned in the same style); a paid animation pack only if the sheet earns its place.
