# Handoff

Status as of 2026-10-30: Phase 1 code is written and committed. It is **not deployed** and has **not passed the acceptance test** in PLAN.md yet.

## What was built (Phase 1)

- **Home**: Start/Resume workout, outlet picker (remembers last used), Cardio and Bodyweight buttons, past workouts list, Export JSON.
- **Workout**: header with outlet, elapsed time and Finish. Exercise cards with a "Last:" line, set rows (W toggle, weight stepper or kettlebell chips, reps or seconds stepper, ✓), + Set / − Set, workout note.
- **Exercise picker**: recent at this outlet, full list by category with search, collapsed Gated section, "+ Add custom machine here" sheet.
- **Cardio**: Zone 2 / 4x4 / Bike, prefilled from the last session of the same type; 4x4 has a 4-row interval grid.
- **Bodyweight**: date, kg, optional waist, recent entries.
- **Export**: `gymlog-YYYY-MM-DD.json` via the share sheet if available, otherwise a download.
- **Storage**: Dexie (IndexedDB), all tables from the data model including `sync_log`. `navigator.storage.persist()` is requested on start.
- **PWA**: manifest, icons and service worker via vite-plugin-pwa. Vite `base` is `/gym-log/`.

## Where things are

- `src/db.ts`: database tables and seeding from `src/data/seed.json`
- `src/history.ts`: "Last time" lookup, prefill rule, equipment-vs-exercise keying
- `src/export.ts`: JSON export
- `src/screens/`: one file per screen; `src/components/`: Stepper, BellChips
- Run locally: `npm install`, then `npm run dev`, then open http://localhost:5173/gym-log/

## Decisions not spelled out in PLAN.md

- Finish deletes unticked sets; a workout with no ticked sets is deleted entirely.
- Reopening the app during an unfinished workout goes straight back to it.
- "− Set" removes the last row of an exercise, but only if it isn't ticked.
- Kettlebell exercises with no history start at 12 kg (the seed's 4 kg increment isn't a bell size).
- Bodyweight-plus exercises start at +0 kg; timed exercises start at the low end of their range in seconds.
- Custom machines are stored as a new exercise (`custom: true`) plus one equipment row at the chosen outlet, and only appear in the picker at that outlet.
- Sets have an extra `seq` field (creation order) used to order cards and rows.
- Cardio is saved as a `type: 'cardio'` workout at the last-used outlet, ending when Save is tapped.
- Export also includes `completedAt` per set and `s` (seconds) for timed sets, alongside `w`, `r`, `warmup`.
- One dark, high-contrast theme; no light/dark switching.
- IDs use a small UUID helper rather than `crypto.randomUUID`, so the app also works over plain-http Wi-Fi during testing.
- `npm audit` shows 4 low-severity warnings in a build-time dependency of vite-plugin-pwa; left as-is.

## Still to do

1. **GitHub Pages workflow**: GitHub Actions build on push to `main`, publish `dist`, enable Pages in repo settings.
2. **Click-through check**: the app type-checks and builds, but no one has tapped through it in a browser yet.
3. **Acceptance test** on the phone (airplane mode, installed PWA), which needs the HTTPS deployment from step 1.
