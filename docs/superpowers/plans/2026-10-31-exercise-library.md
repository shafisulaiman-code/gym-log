# Exercise Library and Muscle-Group Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Browse the picker by muscle group, split the fly machine, add 21 exercises (cable, dumbbell, plyo) with cues and drawings, and log box jumps by height.

**Architecture:** Two small pure modules carry the new logic (`src/muscles.ts` for chip mapping, a `height_cm` branch in `history.ts` / `summary.ts`); the picker gains a chip row that swaps its grouped list for a flat filtered one; the seed grows and `setupDb()` prunes seed exercises that disappear; `scripts/fetch_visuals.py` gains the new drawing pairs.

**Tech Stack:** Vite 8, React 19, TypeScript, Dexie 4, Vitest, plain CSS, Pillow script for visuals.

**Spec:** `docs/superpowers/specs/2026-10-31-exercise-library-design.md`

## Global Constraints

- Tap targets ≥ 56 px; chips use the existing `.chip` / `.chip-row.scroll` styles.
- No templates, routines or rest timer. No new settings. No Dexie schema change (version stays 2).
- Seed exercise ids are stable except `m-pec-fly-rear-delt`, which is removed.
- `weightKg` keeps its name; for `height_cm` it holds centimetres.
- Export JSON shape unchanged.
- Drawings: Everkinetic via Commons only, sources ≥ 600 px, 5 MB folder budget (lower `MAX_SIDE` to 640 and rerun with `--force` if exceeded).
- Commit after each task; never push.

## Review Focus

1. Opening a workout whose set rows reference a pruned exercise id (old fly machine on the phone): the screen must load and skip those rows, not throw. Test added in Task 3.
2. A Box Jump with no history: prefill gives `weightKg` 50 and the stepper reads cm. Test in Task 2.
3. Muscle chip with search producing no rows: the empty-state line shows, no crash. Browser check in Task 4.
4. A custom machine (`primaryMuscles: []`) under a muscle chip: must not appear, must still appear under All. Test in Task 1.
5. Finish sheet volume with a Box Jump plus a Leg Press: only the Leg Press counts. Test in Task 2.

---

### Task 1: Muscle chip mapping

**Files:**
- Create: `src/muscles.ts`
- Test: `src/muscles.test.ts`

**Interfaces:**
- Produces: `export const CHIPS = ['Chest','Back','Shoulders','Biceps','Triceps','Legs','Glutes','Core'] as const`; `export type Chip = typeof CHIPS[number]`; `export function chipsFor(muscle: string): Chip[]`; `export function exercisesFor(chip: Chip, exercises: Exercise[]): Exercise[]` (sorted by name, includes gated, excludes nothing else).

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { CHIPS, chipsFor, exercisesFor } from './muscles'
import type { Exercise } from './types'

const ex = (id: string, muscles: string[], gated = false) =>
  ({ id, name: id, primaryMuscles: muscles, gated, custom: false }) as unknown as Exercise

describe('chipsFor', () => {
  it('maps every seed muscle to its chip', () => {
    expect(chipsFor('lats')).toEqual(['Back'])
    expect(chipsFor('lower back')).toEqual(['Back'])
    expect(chipsFor('rear delts')).toEqual(['Shoulders'])
    expect(chipsFor('calves')).toEqual(['Legs'])
    expect(chipsFor('hip flexors')).toEqual(['Legs'])
    expect(chipsFor('glutes')).toEqual(['Glutes'])
  })
  it('maps grip and unknown strings to no chip', () => {
    expect(chipsFor('grip')).toEqual([])
    expect(chipsFor('made up')).toEqual([])
  })
})

describe('exercisesFor', () => {
  const list = [
    ex('b-row', ['lats', 'upper back']),
    ex('a-curl', ['biceps']),
    ex('deadlift', ['back'], true),
    ex('custom', []),
  ]
  it('returns matching exercises sorted by name, gated included', () => {
    expect(exercisesFor('Back', list).map((e) => e.id)).toEqual(['b-row', 'deadlift'])
  })
  it('never returns an exercise with no muscles', () => {
    for (const c of CHIPS) expect(exercisesFor(c, list).map((e) => e.id)).not.toContain('custom')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/muscles.test.ts`
Expected: FAIL, cannot find module './muscles'

- [ ] **Step 3: Implement `src/muscles.ts`**

A `Record<string, Chip>` from the spec's mapping table (chest; back, lats, upper back, lower back; shoulders, rear delts; biceps; triceps; quads, hamstrings, adductors, hip flexors, calves; glutes; core). `chipsFor` looks up the record (array of zero or one). `exercisesFor` filters `e.primaryMuscles.some(m => chipsFor(m).includes(chip))` and sorts with `localeCompare` on name.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/muscles.test.ts`
Expected: PASS 4/4

- [ ] **Step 5: Commit**

```bash
git add src/muscles.ts src/muscles.test.ts
git commit -m "Add muscle chip mapping for the picker"
```

---

### Task 2: `height_cm` load mode

**Files:**
- Modify: `src/types.ts` (LoadMode union)
- Modify: `src/history.ts` (prefillRows default, formatLast load unit)
- Modify: `src/summary.ts` (volumeKg exclusion)
- Modify: `src/screens/Workout.tsx` SetRowView (stepper unit)
- Modify: `src/screens/TechniqueSheet.tsx` loadPill
- Test: `src/history.test.ts`, `src/summary.test.ts`

**Interfaces:**
- Produces: `LoadMode` includes `'height_cm'`; `export function loadUnit(ex: Exercise): 'kg' | 'cm'` in `history.ts`.

- [ ] **Step 1: Write the failing tests**

In `src/history.test.ts` add a fixture `boxJump: Exercise` (`id 'plyo-box-jump'`, `equipmentType 'bodyweight'`, `loadMode 'height_cm'`, `defaultIncrementKg 5`, `repRange [3, 6]`) and:

```ts
it('prefills a box jump at 50 cm × 10 when there is no history', () => {
  const [row] = prefillRows(boxJump, undefined, 'w1', [])
  expect(row.weightKg).toBe(50)
  expect(row.reps).toBe(10)
})
it('formats height sets in cm', () => {
  const rows = [set({ weightKg: 60, reps: 5 }), set({ weightKg: 60, reps: 4 })]
  expect(formatLast(boxJump, rows)).toBe('Last: 60 cm × 5, 4')
})
it('loadUnit is cm only for height_cm', () => {
  expect(loadUnit(boxJump)).toBe('cm')
  expect(loadUnit(legPress)).toBe('kg')
})
```

(`set()` is whatever helper the file already uses to build a completed SetRow; add one if absent.)

In `src/summary.test.ts`:

```ts
it('excludes height_cm exercises from volume', () => {
  const rows = [done('m-leg-press', 100, 10), done('plyo-box-jump', 60, 5)]
  expect(volumeKg(rows, { 'm-leg-press': legPress, 'plyo-box-jump': boxJump })).toBe(1000)
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/history.test.ts src/summary.test.ts`
Expected: FAIL on type `'height_cm'` not assignable / `loadUnit` not exported / wrong strings.

- [ ] **Step 3: Implement**

- `types.ts`: `export type LoadMode = 'total' | 'per_hand' | 'bodyweight_plus' | 'timed' | 'height_cm'`.
- `history.ts`: `export function loadUnit(ex)`; in `prefillRows`, before the `equipmentType !== 'bodyweight'` branch, `else if (ex.loadMode === 'height_cm') row.weightKg = 50`; in `formatLast`'s `load()`, use `` `${fmt(w)} ${loadUnit(ex)}` `` instead of the hard-coded kg.
- `summary.ts` `volumeKg`: `if (!ex || ex.loadMode === 'timed' || ex.loadMode === 'height_cm') continue`.
- `Workout.tsx` SetRowView: weight `Stepper` gets `unit={loadUnit(ex)}`; `noLoad` unchanged.
- `TechniqueSheet.tsx` `loadPill`: `case 'height_cm': return 'cm'`.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run && npx tsc --noEmit -p .`
Expected: all green, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/history.ts src/summary.ts src/screens/Workout.tsx src/screens/TechniqueSheet.tsx src/history.test.ts src/summary.test.ts
git commit -m "Add height_cm load mode for box jumps"
```

---

### Task 3: Seed changes and seed pruning

**Files:**
- Modify: `src/data/seed.json`
- Create: `src/seedPrune.ts`
- Modify: `src/db.ts` (setupDb)
- Modify: `src/screens/Workout.tsx` load() (skip unknown exercise ids)
- Modify: `src/screens/Picker.tsx` (`CATEGORY_ORDER` gets `'Plyo'` last)
- Test: `src/seedPrune.test.ts`

**Interfaces:**
- Produces: `export function staleSeedIds(existing: Pick<Exercise,'id'|'custom'>[], seedIds: string[]): string[]`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { staleSeedIds } from './seedPrune'

describe('staleSeedIds', () => {
  it('returns non-custom ids that left the seed and keeps custom ones', () => {
    const existing = [
      { id: 'm-pec-fly-rear-delt', custom: false },
      { id: 'm-leg-press', custom: false },
      { id: 'abc-123', custom: true },
    ]
    expect(staleSeedIds(existing, ['m-leg-press', 'm-pec-fly'])).toEqual(['m-pec-fly-rear-delt'])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/seedPrune.test.ts`
Expected: FAIL, module missing.

- [ ] **Step 3: Implement `seedPrune.ts` and wire it**

`staleSeedIds` filters `!e.custom && !seedIds.includes(e.id)`. In `setupDb()`, after `bulkPut(seed.exercises)`: `const stale = staleSeedIds(await db.exercises.toArray(), seed.exercises.map(e => e.id)); if (stale.length) await db.exercises.bulkDelete(stale)`. Update the v2 comment to mention `visualFrames` and the prune.

In `Workout.tsx` `load()`: after building `exMap`, `rows = rows.filter(r => exMap[r.exerciseId])` before anything reads `ex`.

- [ ] **Step 4: Edit the seed**

Write a one-off Python script in the scratchpad (not committed) that loads `seed.json`, removes `m-pec-fly-rear-delt`, inserts `m-pec-fly` and `m-rear-delt-fly` at its position, appends the 21 exercises from the spec's three tables in that order, and dumps with `indent=2, ensure_ascii=False`. Every exercise has all fields in the existing key order, `visualId: null`, `visualFrames: 0` (Task 5's script fills these), 3–5 cues, cautions prefixed `!`. Field values per the spec tables; `pattern` values: cable curl `curl`, lateral raises `raise`, pulldown/row/pullover `pull_v` or `pull_h` as the nearest existing pattern, presses `push_v`/`push_h`, squats `squat`, hinge moves `hinge`, core `core`, jumps `jump`. `note` one line like the existing seed; Box Jump note "Weight = box height in cm."

`Picker.tsx`: `const CATEGORY_ORDER = ['Machine', 'Cable', 'Free weight', 'Kettlebell', 'Core', 'Plyo']`.

- [ ] **Step 5: Verify**

Run: `npx vitest run && npx tsc --noEmit -p . && python3 -I -c "import json;s=json.load(open('src/data/seed.json'));print(len(s['exercises']))"`
Expected: green, clean, prints 52.

Browser (dev server in the terminal tab): reload the app; the open workout still loads; the picker's Machine group shows Pec Fly and Rear Delt Fly and no combined row; a Plyo group appears last with six items.

- [ ] **Step 6: Commit**

```bash
git add src/data/seed.json src/seedPrune.ts src/seedPrune.test.ts src/db.ts src/screens/Workout.tsx src/screens/Picker.tsx
git commit -m "Split the fly machine, add cable, dumbbell and plyo exercises, prune stale seed rows"
```

---

### Task 4: Muscle chips in the picker

**Files:**
- Modify: `src/screens/Picker.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `CHIPS`, `Chip`, `exercisesFor` from Task 1.

- [ ] **Step 1: Add state and the chip row**

`const [chip, setChip] = useState<Chip | null>(null)`. Under the `.overlay-header`, render `<div className="chip-row scroll muscle-chips">` with an **All** chip (`selected` when `chip === null`) and one chip per `CHIPS` entry; tapping a selected chip sets `null`. Chips are `<button type="button" className="chip ...">`.

- [ ] **Step 2: Branch the list**

When `chip` is null, render exactly today's content. When set: `const items = exercisesFor(chip, visible).filter(matches)`; render `items.map(e => <div key={e.id}><ExerciseItem .../>{e.gated && <div className="ex-note">{e.note}</div>}</div>)`; when `items.length === 0`, `<p className="muted empty">Nothing here for that search.</p>`. Recent and the gated disclosure are not rendered in chip mode.

- [ ] **Step 3: CSS**

`.muscle-chips { margin: 0 0 12px; }` and make sure `.chip-row.scroll` hides its scrollbar and the chips do not wrap (`flex-wrap: nowrap`, `white-space: nowrap`). `.empty { padding: 24px 0; text-align: center; }`.

- [ ] **Step 4: Browser check**

At 375 px: open the picker; chip row scrolls sideways; tap **Back**: the 14 rows from the spec's acceptance check 1, alphabetical, Barbell Deadlift with its note; tap **Back** again: grouped view returns; type "curl" under **Biceps**: Cable Curl and Dumbbell Curl; type "zzz": the empty line. Tap an item: it is added and the picker closes. Android back from chip mode closes the picker (existing layer behaviour, unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/screens/Picker.tsx src/styles.css
git commit -m "Browse the picker by muscle group"
```

---

### Task 5: Drawings for the new exercises

**Files:**
- Modify: `scripts/fetch_visuals.py` (`VISUALS`)
- Modify: `src/data/seed.json` (written by the script)
- Modify: `public/visuals/` (new frames, ATTRIBUTION.md)

- [ ] **Step 1: Extend `VISUALS`**

Replace the `m-pec-fly-rear-delt` entry with `"m-pec-fly": ["File:Butterfly machine 1.svg", "File:Butterfly machine 2.svg"]` and add:

| id | titles |
|---|---|
| c-cable-curl | Standing biceps curl with cable 1.svg / 2.svg |
| c-straight-arm-pulldown | Straight arm push down 1.svg / 2.svg |
| c-cable-chest-fly | Cable crossover 1.svg / 2.svg |
| c-cable-crunch | Seated ab crunch with cable 1.svg / 2.svg (proxy: seated) |
| db-curl | Biceps curl with dumbbell 1.svg / 2.svg |
| db-lateral-raise | Lateral dumbbell raises 1.svg / 2.svg |
| db-incline-press | Incline dumbbell press 1.svg / 2.svg |
| db-bulgarian-split-squat | One leg squat with barbell 1.svg / 2.svg (proxy: barbell) |
| db-skull-crusher | Lying triceps extension with dumbbells 1.svg / 2.svg |
| db-arnold-press | Arnold press 1.svg / 2.svg |
| db-pullover | Dumbbell bent arm pullover 1.svg / 2.svg |

No drawing (checked against the Commons title list on 2026-10-31): Rear Delt Fly, Cable Lateral Raise, Single-arm Cable Row, Cable Pull-through, One-arm Dumbbell Row, all six plyo moves.

- [ ] **Step 2: Build**

Run: `python3 -I scripts/fetch_visuals.py`
Expected: 11 new pairs built, "32 drawings", total under 5 MB, seed.json updated with `visualId`/`visualFrames` for the new ids and `null`/0 for the rest. If over budget: set `MAX_SIDE = 640`, rerun with `--force`.

- [ ] **Step 3: Eyeball**

Build a contact sheet of the 11 new pairs in the scratchpad and read it: every pair must show a different start and end position. Replace any that do not (as happened with the wide-grip pulldown) before continuing.

- [ ] **Step 4: Verify**

Run: `npx vitest run && npx tsc --noEmit -p . && npm run build`
Expected: green; precache entry count grew by 22; dist under 6 MB.

- [ ] **Step 5: Commit**

```bash
git add scripts/fetch_visuals.py src/data/seed.json public/visuals
git commit -m "Add drawings for the new exercises"
```

---

### Task 6: Docs and handoff

**Files:**
- Modify: `HANDOFF.md`, `README.md`
- Add: `docs/superpowers/specs/2026-10-31-exercise-library-design.md`, this plan

- [ ] **Step 1: Update HANDOFF.md**

Library section: 52 exercises, Plyo group, muscle chips, `height_cm`, seed prune, drawings coverage (32 of 52) with the proxy list and the no-drawing list. "Still to do" unchanged (Shafi's click-through, deploy, airplane test).

- [ ] **Step 2: Update README.md** technique visuals paragraph with the new coverage figure.

- [ ] **Step 3: Commit**

```bash
git add HANDOFF.md README.md docs/superpowers
git commit -m "Document the exercise library expansion"
```

- [ ] **Step 4: Phone check**

Dev server up in the terminal tab; Shafi runs the spec's acceptance checks 1–7 on the phone.
