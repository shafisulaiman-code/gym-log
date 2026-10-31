# Exercise library expansion and muscle-group picker

Date: 2026-10-31. Requested by Shafi after the first phone click-through of the Phase 1 redesign. Builds on `docs/superpowers/specs/2026-10-31-phase1-redesign-design.md` and PLAN.md; where this document is silent, those apply.

## Intent

Shafi logs one exercise at a time while he is already in a workout. Today the picker groups exercises by equipment, and the library is the 31-move minimum. He wants to browse by the muscle he is training, and he wants more to choose from: cable work for variation, dumbbell curls, more dumbbell moves, and a plyometric group starting with box jumps. The fly machine also needs splitting, because he does pec fly and rear delt fly as two exercises with two weights.

The rest timer stays in Phase 2 (Shafi: "let's go with the initial plan"). Nothing here assembles workouts ahead of time: no routines, no templates, per PLAN.md's Do-not-build list.

## Goals

- From inside a workout, find an exercise by muscle group in two taps: chip, then exercise.
- Pec Fly and Rear Delt Fly are separate machines with separate weights per outlet.
- The library grows by about 20 exercises, each with cues, a sensible step, and a technique drawing where the Everkinetic set has one.
- Box jumps log reps and box height, and the "Last" line shows the height jumped last time.

## Non-goals and anti-goals

- No workout templates, routines, supersets, or pre-built sessions. The muscle view is a filter on the picker, nothing more.
- No rest timer (Phase 2).
- No new settings. No change to the Home screen.
- Do not drop or rename any existing exercise id other than the fly split below. Existing set history keeps working.

## Constraints

- Everything in PLAN.md: fewest taps per set, 56 px targets, offline-first, plain CSS, no component library.
- The design system from the redesign spec (tokens, chips, list items, sheets) is reused as is.
- Drawings follow the pipeline in `scripts/fetch_visuals.py`: Everkinetic via Wikimedia Commons, CC BY-SA 3.0, two frames where both exist, sources under 600 px refused. New exercises without a drawing show the placeholder and the YouTube button, like today.
- Seed changes land in `src/data/seed.json`; `setupDb()` re-puts seed rows on every start, so the phone picks them up on reload with no migration. The Dexie schema does not change (no new indexes).

## The muscle-group view

### Where it lives

In the existing picker overlay, directly under the search field and above "+ Add custom machine here": a horizontally scrollable row of chips. First chip **All**, selected by default; then **Chest, Back, Shoulders, Biceps, Triceps, Legs, Glutes, Core**. Chips are the existing `.chip` style, 56 px tall tap area, one line, no wrapping; the row scrolls sideways with the scrollbar hidden.

### Behaviour

- **All** shows the picker exactly as today: Recent at this outlet, then the equipment groups in `CATEGORY_ORDER` (with the new Plyo group appended, see below), then the gated disclosure.
- Tapping a muscle chip selects it (only one at a time; tapping it again returns to All) and replaces the grouped list with one flat list of every visible exercise whose muscles map to that chip, including gated ones (gated items keep their caution tags and their note under the row, no disclosure). Recent is hidden in this mode. Items are sorted alphabetically. Each row is the existing `ExerciseItem` (44 px thumbnail, name, back/knee tags). One tap adds the exercise and closes the picker, as today.
- Search filters within the selected chip. Clearing search keeps the chip.
- The selected chip resets to All each time the picker opens. Nothing is persisted.
- An empty result (chip plus search with no matches) shows one muted line: "Nothing here for that search."

### Muscle mapping

`primaryMuscles` values in the seed map to chips as follows. One exercise can appear under several chips.

| Chip | primaryMuscles values |
|---|---|
| Chest | chest |
| Back | back, lats, upper back, lower back |
| Shoulders | shoulders, rear delts |
| Biceps | biceps |
| Triceps | triceps |
| Legs | quads, hamstrings, adductors, hip flexors, calves |
| Glutes | glutes |
| Core | core |

`grip` maps to no chip (those exercises still appear under their other muscles and under All). The mapping is a constant in `src/muscles.ts` with a pure `chipFor(muscle)` / `exercisesFor(chip, exercises)` pair and unit tests. Unknown muscle strings (from future seed edits) map to no chip and do not throw.

## Splitting the fly machine

Replace `m-pec-fly-rear-delt` with two Machine exercises:

- `m-pec-fly`, "Pec Fly", primaryMuscles [chest], pattern push_h, selectorised, total, step 5, reps 12–15. Drawing: Butterfly machine (the existing pair).
- `m-rear-delt-fly`, "Rear Delt Fly", primaryMuscles [rear delts, upper back], pattern pull_h, selectorised, total, step 5, reps 12–15. Drawing: a reverse-fly / rear-delt machine pair if Commons has one, otherwise placeholder.

Cues are split from the current combined list, with the "log as separate machines" lines removed. Equipment rows are created lazily per outlet by `getOrCreateEquipment`, so nothing else changes there.

Removing a row from the seed does not remove it from the phone: `setupDb()` upserts with `bulkPut` and never deletes, so the old combined machine would stay in IndexedDB beside the two new ones. **My call (builder check):** `setupDb()` gains a prune step that deletes every exercise with `custom` false whose id is no longer in the seed. This is plain code, not a schema change, and it makes future seed removals work the same way. Set rows that still reference a pruned id are test data from this week and are left in place; the Workout screen's `load()` must skip rows whose exercise is unknown (today it throws on them), and `prefillRows`, `summarize` and the export already tolerate them.

## New exercises

All new exercises: `custom: false`, `gated: false` unless stated, `visualId`/`visualFrames` written by the fetch script, 3–5 cues with a leading "!" on cautions, in the style of the existing seed. The builder writes the cues; the table pins the fields that change behaviour.

### Cable (category Cable, equipmentType cable, loadMode total unless stated, keyed per machine)

| id | name | muscles | step kg | reps | notes |
|---|---|---|---|---|---|
| c-cable-curl | Cable Curl | biceps | 2.5 | 10–15 | |
| c-cable-lateral-raise | Cable Lateral Raise | shoulders | 1.25 | 12–20 | unilateral, per_hand |
| c-straight-arm-pulldown | Straight-arm Pulldown | lats | 2.5 | 10–15 | |
| c-cable-chest-fly | Cable Chest Fly | chest | 2.5 | 10–15 | per_hand (one stack each side) |
| c-single-arm-row | Single-arm Cable Row | lats, upper back | 2.5 | 8–12 | unilateral, per_hand |
| c-cable-crunch | Cable Crunch | core | 2.5 | 12–20 | |
| c-cable-pull-through | Cable Pull-through | glutes, hamstrings | 2.5 | 10–15 | backCaution |

### Dumbbell (category Free weight, equipmentType dumbbell, loadMode per_hand, step 2.5 kg, unilateral where stated)

| id | name | muscles | reps | notes |
|---|---|---|---|---|
| db-curl | Dumbbell Curl | biceps | 8–12 | |
| db-one-arm-row | One-arm Dumbbell Row | lats, upper back | 8–12 | unilateral |
| db-lateral-raise | Dumbbell Lateral Raise | shoulders | 12–20 | step 1.25 |
| db-incline-press | Incline Dumbbell Press | chest, triceps, shoulders | 8–12 | |
| db-bulgarian-split-squat | Bulgarian Split Squat | quads, glutes | 8–12 | unilateral, kneeCaution |
| db-skull-crusher | Dumbbell Skull Crusher | triceps | 10–15 | |
| db-arnold-press | Arnold Press | shoulders, triceps | 8–12 | |
| db-pullover | Dumbbell Pullover | lats, chest | 10–15 | loadMode total (one bell, two hands) |

### Plyo (new category "Plyo", appended last in `CATEGORY_ORDER`; equipmentType bodyweight unless stated; all kneeCaution except Jump Rope and Slam)

| id | name | muscles | loadMode | reps / time | notes |
|---|---|---|---|---|---|
| plyo-box-jump | Box Jump | quads, glutes | height_cm | 3–6 | step 5 cm, see logging below |
| plyo-jump-squat | Jump Squat | quads, glutes | bodyweight_plus | 6–10 | |
| plyo-broad-jump | Broad Jump | glutes, quads, hamstrings | bodyweight_plus | 3–5 | |
| plyo-lateral-bound | Lateral Bound | glutes, quads | bodyweight_plus | 6–10 | unilateral, reps per side |
| plyo-jump-rope | Jump Rope | calves | timed | 60–180 s | no load, like Plank |
| plyo-med-ball-slam | Medicine Ball Slam | core, lats | total | 8–12 | step 1 kg (ball weight), equipmentType bodyweight so it is not keyed per machine |

The plyo list beyond Box Jump is my recommendation (Shafi asked for suggestions): low-skill moves that need only a box, a rope, a ball and floor space, which every Anytime Fitness outlet has. Every jump carries kneeCaution so the tag shows in the picker. `calves` is a new primaryMuscles value and maps to Legs.

Cues for jumps lead with landing: soft knees, land quiet, step down from the box rather than jumping down.

## Box height logging: `loadMode: 'height_cm'`

A new `LoadMode` value, `height_cm`. It behaves like `total` everywhere except the unit:

- Set row: the weight stepper shows the value with unit **cm**, step from `defaultIncrementKg` (5), default 50 when there is no history. The reps stepper is unchanged. `weightKg` stores the height in cm; the field name is not renamed (a rename would touch every set row for one exercise).
- "Last" line and finish-sheet lines: `60 cm × 5, 5, 4`, using the same formatter with the unit swapped.
- Volume: exercises with `height_cm` add nothing to the finish sheet's kg total (treated like timed).
- Ghost rows, ✓, warm-up badge, "+ Set": unchanged.
- Kettlebell chips and the step pill never apply (bodyweight equipment).

`fmtLoad(ex, kg)` style logic lives in `history.ts` next to `formatLast`, with tests for the cm case and the volume exclusion. The technique sheet shows a **cm** pill for this mode where it shows "per hand" or "seconds" for the others. Prefill gives bodyweight-equipment rows no `weightKg`, so the 50 cm default is a small special case.

**Export (my call, builder check):** the JSON export shape stays frozen. A Box Jump set exports as `w: 50` like any other set; the `exercises` array in the same file already carries `loadMode: 'height_cm'`, which is how a reader tells height from kilograms. Nothing new is emitted.

## Picker rendering of the new groups

Under All, groups are: Machine, Cable, Free weight, Kettlebell, Core, Plyo. Within a group, alphabetical as today.

## Drawings

For every new exercise the builder searches the Everkinetic set on Commons for a start/end pair (SVG preferred, then PNG ≥ 600 px), adds it to `VISUALS` in `scripts/fetch_visuals.py`, and reruns the script. Proxies are allowed when the movement reads the same (for example a seated rear-delt machine for Rear Delt Fly) and are listed in HANDOFF.md as today. No proxy where the movement differs (do not use a standing move for a jump). Exercises with no match keep `visualId: null`. The 5 MB budget in the script still applies; if the new pairs push the folder over it, the builder lowers `MAX_SIDE` to 640 rather than dropping drawings.

## Data changes

- `LoadMode` gains `'height_cm'`.
- Seed: one exercise removed, two added for the fly; 21 new exercises; new category Plyo; new muscle `calves`.
- `setupDb()`: prune of non-custom exercises missing from the seed (see the fly split).
- No change to `Equipment`, `SetRow`, `Workout`, or the Dexie schema.

## Acceptance checks (phone, before Shafi's sign-off)

1. Open the picker mid-workout. Tap **Back**: every exercise whose muscles include back, lats, upper back or lower back, from any equipment type, including kettlebell moves (Kettlebell Single-arm Row, Kettlebell Clean) and gated ones (Barbell Deadlift, with its note). With the seed in this spec that is 14 rows: Lat Pulldown, Seated Row, Cable Row, Face Pull, Single-arm Cable Row, Straight-arm Pulldown, One-arm Dumbbell Row, Dumbbell Pullover, Rear Delt Fly, Back Extension, Bird-dog, Kettlebell Single-arm Row, Kettlebell Clean, Barbell Deadlift. Nothing chest-only. Tap one: it is added and the picker closes. The mapping table governs; this list is derived from it.
2. Tap **All**: the familiar grouped list, now ending with a Plyo group.
3. Add Pec Fly and Rear Delt Fly at one outlet: two cards, two weights, two step pills.
4. Add Box Jump: the stepper reads cm, steps by 5, "Last" shows `50 cm × 5` after finishing a set. The finish sheet volume does not include it.
5. Add Jump Rope: seconds stepper, no load control.
6. Search "curl" under All and under Biceps: Dumbbell Curl and Cable Curl in both.
7. Every new exercise's technique sheet opens; drawings show for those that have one, the placeholder and YouTube button for the rest.
8. `npm test` green, `tsc` clean, production build precaches the new frames.

## Left to the builder

- Cue wording, drawing selection and proxies, exact chip order of the scroll row's overflow behaviour on a 360 px screen, the empty-state copy's placement, test file layout.
- Whether `exercisesFor` sorts by name or by category-then-name (spec says name; change it if the flat list reads badly with 11 items, and say so).
