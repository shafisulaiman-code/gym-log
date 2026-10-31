# Gym Log: build plan for Claude Code

Personal workout logger for one user (Shafi), one phone (OnePlus 15, Android, Chrome), used at Anytime Fitness outlets in Singapore. Offline-first PWA. Data stays on device, exports as JSON, later syncs to a Google Sheet that a claude.ai Project reads.

**Build Phase 1 only.** Do not start Phase 2+ unless explicitly asked. Read the "Do not build" section before writing any code.

## Stack (fixed, do not substitute)

- Vite + React + TypeScript
- Dexie (IndexedDB) for storage, call `navigator.storage.persist()` on first load
- vite-plugin-pwa for manifest + service worker (precache app shell, offline-first)
- Plain CSS or Tailwind, mobile-only layout, no component library
- Deploy target: GitHub Pages from a public repo via a GitHub Actions workflow (build on push to main, publish `dist`). Set Vite `base` to the repo name. HTTPS is required for the service worker; GitHub Pages provides it. No backend in Phase 1.
- Seed data lives in `src/data/seed.json` (provided)

## Core principle: fewest taps per set

The whole app exists so that logging a set is one tap most of the time. Every screen decision is judged by that. Keyboard entry is the last resort, not the default.

## Phase 1 scope (one weekend)

### Screens
1. **Home**: big "Start workout" button, outlet picker (defaults to last used), list of past workouts (date, outlet, exercise count, duration), "Export JSON" button.
2. **Workout** (the only screen that matters):
   - Header: outlet, elapsed time, "Finish" button.
   - "Add exercise" opens the picker (see below). Freestyle is the only mode: no templates, no routines. User adds exercises as he goes.
   - Each exercise shows a card with set rows. Each set row: warm-up toggle (W badge), weight stepper, reps stepper, ✓ button.
   - Below the exercise name, a one-line "Last time" summary from the same equipment: e.g. `Last: 60 kg × 12, 12, 10`. Phase 1 shows this line; Phase 2 makes it richer.
   - "+ Set" duplicates the previous set row (same weight, same reps).
   - ✓ marks the set complete, records `completedAt`, triggers `navigator.vibrate(40)`. No separate save.
   - Weight stepper increments by the equipment's `stackStepKg` or the exercise's `defaultIncrementKg`. Long-press steps by 2x. Tap the number to type if needed.
   - Kettlebell exercises show bell-size chips (8, 12, 16, 20, 24, 28, 32 kg) instead of a stepper.
   - Bodyweight exercises show reps only (plus optional added kg).
   - Timed exercises (plank, carries) show seconds instead of reps.
   - Optional per-workout free-text note field.
3. **Exercise picker**:
   - Section 1: "Recent at this outlet" (up to 8, most recent first).
   - Section 2: full seed list grouped by category, with search.
   - Section 3 (collapsed): "Gated" exercises with their caution note.
   - "+ Add custom machine here" opens a sheet: name, outlet (prefilled), stack step chips (2.5 / 5 / 7 / 10 / custom), optional start weight. Must take under 15 seconds. This is Phase 1 because freestyle across five outlets will hit unknown machines on day one.
4. **Cardio entry**: a simple form reachable from Home. Modality (Zone 2 / 4x4 / bike), duration min, incline %, speed km/h, avg HR, max HR, optional RPE and note. Prefills from last entry of the same modality. The 4x4 variant adds a 4-row interval grid (speed, incline, peak HR). This is in Phase 1 because wearable sync is broken and cardio is half his training.
5. **Bodyweight entry**: date, kg, optional waist cm. One tap from Home.

### Prefill rule
When an exercise is added to a workout, create set rows matching the last session on the same `equipmentId` (or `exerciseId` for free weights and kettlebells): same number of working sets, same weight, same reps. Warm-up sets from last time are also reproduced. If no history, create one empty row with the exercise's default increment as the weight and 10 reps.

### Export
"Export JSON" writes a single file `gymlog-YYYY-MM-DD.json` matching the schema below, using the Web Share API if available, otherwise a download. Include everything (workouts, sets, cardio, bodyweight, exercises, equipment, outlets).

### Acceptance test (must pass before Phase 1 is done)
In airplane mode on the phone: open the installed PWA, start a workout at "AF Tampines West", add Leg Press, log 3 sets with only ✓ taps after adjusting weight once, add a custom machine, finish, then export JSON and open the file. Then reopen the app and confirm "Last time" shows for Leg Press.

## Data model

```
outlets(id, name)
exercises(id, name, category, primaryMuscles[], pattern, equipmentType, unilateral, loadMode, defaultIncrementKg, repRange[min,max], backCaution, kneeCaution, gated, note)
equipment(id, exerciseId, outletId, label, stackStartKg?, stackStepKg, maxKg?)
workouts(id, startedAt, endedAt?, outletId, type: 'strength'|'cardio', notes?)
sets(id, workoutId, exerciseId, equipmentId?, setIndex, isWarmup, weightKg?, reps?, durationSec?, rir?, painFlag?, completedAt?)
cardio_sessions(id, workoutId, modality: 'treadmill_z2'|'treadmill_4x4'|'bike', durationMin, inclinePct?, speedKph?, avgHr?, maxHr?, intervals?: [{workMin, speedKph, inclinePct, peakHr}], rpe?, notes?)
bodyweight(id, date, kg, waistCm?)
sync_log(id, workoutId, sentAt, status)   // unused until Phase 4, create the table now
```

Rules:
- UUIDs, ISO timestamps with +08:00 offset, kg as decimals.
- History, prefill and "Last time" are keyed on `equipmentId` for machines and cables, on `exerciseId` for free weights, kettlebells and bodyweight. Machines at different outlets are never compared.
- `loadMode`: `total` (machine, barbell), `per_hand` (dumbbell, kettlebell single), `bodyweight_plus`, `timed`.
- `rir` and `painFlag` exist in the schema now; the UI for them is Phase 2 and 3.

## Export JSON shape

```json
{
  "schema": "gymlog/1",
  "exportedAt": "2026-11-02T21:10:00+08:00",
  "outlets": [...], "exercises": [...], "equipment": [...],
  "workouts": [{ "id": "...", "date": "2026-11-02", "outlet": "AF Tampines West", "type": "strength",
    "exercises": [{ "name": "Leg Press", "equipment": "Leg Press @ Tampines West",
      "sets": [{ "w": 100, "r": 12, "warmup": false }, { "w": 100, "r": 11 }] }] }],
  "cardio": [{ "date": "2026-11-04", "modality": "treadmill_4x4", "durationMin": 38, "avgHr": 148, "maxHr": 171,
    "intervals": [{ "workMin": 4, "speedKph": 6.2, "inclinePct": 10, "peakHr": 168 }] }],
  "bodyweight": [{ "date": "2026-11-03", "kg": 109.4 }]
}
```

## Later phases (do not build now)

- **Phase 2 (gym-ready)**: rest timer auto-start on ✓ with vibration + wake lock; RIR chips (0-1 / 2-3 / 4+) after the last working set; pain flag chip (back / knee); supersets (pair two exercises, alternate set rows); timed circuits for kettlebell days (rounds × exercises, round timer); richer "Last time" line with RIR; weekly summary Markdown generator and export.
- **Phase 3 (coaching rules)**: `suggestNext()` double progression with RIR gate (add weight only when every working set hits the top of the rep range at RIR ≥ 1; hold if at RIR 0; drop one step after two sessions below the bottom); stall detection (3 sessions no progress); deload prompt (2 stalls in a week, or e1RM down >5% twice, or 6 weeks without a light week); Epley e1RM for 1-10 rep sets only; PR flags; e1RM sparkline per lift; weekly hard sets per muscle group.
- **Phase 4 (auto-sync)**: Google Apps Script `doPost` endpoint that appends rows to a Sheet (tabs: sets, cardio, bodyweight) and rewrites a Weekly Summary Doc; sync queue with retry on `online` event and app open; Sheet and Doc added to the claude.ai Project.

## Do not build

Social features. In-app AI or chat. Nutrition. Wearable or Health Connect integration. Accounts, auth, login. Multi-device sync. Templates or routine builder. Drop sets. Plate calculator. Dark-mode theming polish. Any settings screen beyond "default outlet". A backend of any kind.

Removed from this list on 2026-10-31 after the first click-through: exercise technique visuals (a looping anatomy-style animation plus written cues per exercise, bundled offline). See `docs/superpowers/specs/2026-10-31-phase1-redesign-design.md`.

## Working rules for Claude Code

- Phase 1 is complete when the acceptance test passes on the phone, not when the code looks finished.
- Prefer boring, obvious code over abstractions. One developer will maintain this.
- Touch targets ≥ 56 px. Steppers must be usable with a sweaty thumb.
- Never ask whether to add a feature from the "Do not build" list. The answer is no.
