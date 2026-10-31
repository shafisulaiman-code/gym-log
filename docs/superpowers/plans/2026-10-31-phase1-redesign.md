# Phase 1 Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle Gym Log in the Fitness dark system, fix the six click-through findings (ghost rows, step size, kettlebell sizes, Finish placement, 4x4 form, export fallback), and add an offline technique sheet with looping anatomy animations and cues.

**Architecture:** Same Vite + React + Dexie app, one file per screen, shared pieces in `src/components/`. Pure logic that the UI depends on (ghost prefill, finish summary, 4x4 helpers, weight parsing) moves into small modules with Vitest tests; screens stay thin. A tiny history-layer module gives every bottom sheet Android-back support. A one-off Python script produces the technique visuals as animated WebP into `public/visuals/`.

**Tech Stack:** Vite 8, React 19, TypeScript, Dexie 4, vite-plugin-pwa 2, plain CSS, Vitest (new dev dependency), Python 3 + Pillow for the asset script.

**Spec:** `docs/superpowers/specs/2026-10-31-phase1-redesign-design.md`

## Global Constraints

- Minimum tap target 56 px in the direction the thumb approaches; stepper + and − are 56 px tall, may be 48 px wide.
- Nothing loads from the network at runtime: fonts and visuals ship in the bundle and are precached.
- Added assets (fonts plus visuals) stay under 5 MB total.
- Export JSON shape does not change.
- One tap per set on the happy path; ghost row ✓ is one write.
- Layout works at 360 px and at 412 to 424 px wide.
- `prefers-reduced-motion: reduce` disables transforms and fades.
- Colours, type scale, radii and durations are the exact values in the spec's "Design system" section.
- No Phase 2 features. The GitHub Pages workflow is not touched.
- Commits per task are allowed only if Shafi confirms at handoff; never push.

## Review Focus

1. Reopening the app mid-workout: persisted ghost rows must still render faint, still count in "of N sets", and Finish with only ghost rows must discard the workout. Pinned in Task 6 (`summarize` with all-ghost input) and Task 4 browser check.
2. Kettlebell "…" input given empty, zero, negative or non-numeric text must leave the current weight unchanged. Pinned in Task 5 (`parseWeight`).
3. 4x4 with `durationMin` shorter than the intervals must not produce negative warm-up or cool-down. Pinned in Task 8 (`timeline`).
4. Export over plain HTTP where share, download and clipboard all fail must still show the JSON text. Pinned in Task 7 browser check over the LAN URL.
5. Changing the shared 4x4 speed after overriding one interval must keep that override. Pinned in Task 8 (`applyShared`).

---

### Task 1: Test harness and data model

**Files:**
- Modify: `package.json` (add `vitest`, `"test": "vitest run"`)
- Modify: `src/types.ts` (SetRow `ghost?: boolean`; Exercise `cues: string[]`, `visualId: string | null`)
- Modify: `src/db.ts` (schema version 2, same stores)
- Modify: `src/data/seed.json` (Leg Press `defaultIncrementKg` 2.5; every exercise gets `"cues": []` and `"visualId": null` for now)
- Modify: `src/history.ts` (`prefillRows` marks copied rows `ghost: true`)
- Modify: `src/screens/CustomMachineSheet.tsx:30-46` (new exercise gets `cues: []`, `visualId: null`)
- Test: `src/history.test.ts`

**Interfaces:**
- Produces: `prefillRows(ex, eq, workoutId, last): SetRow[]` unchanged signature; rows copied from `last` have `ghost: true`, the single default row has no `ghost`.

- [ ] **Step 1: Install Vitest**

Run: `cd /Users/Shuffles/Code/gym-log && npm install -D vitest`
Add `"test": "vitest run"` to scripts.

- [ ] **Step 2: Write the failing tests**

```ts
// src/history.test.ts
import { describe, it, expect } from 'vitest'
import { prefillRows, formatLast } from './history'
import type { Exercise, SetRow } from './types'

const legPress: Exercise = { id: 'm-leg-press', name: 'Leg Press', category: 'Machine', primaryMuscles: ['quads'], pattern: 'squat', equipmentType: 'machine_plate', unilateral: false, loadMode: 'total', defaultIncrementKg: 2.5, repRange: [10, 15], backCaution: true, kneeCaution: true, gated: false, note: '', cues: [], visualId: null }
const eq = { id: 'eq1', exerciseId: 'm-leg-press', outletId: 'o1', label: 'Leg Press @ TW', stackStepKg: 2.5 }
const last: SetRow[] = [
  { id: 'a', workoutId: 'w0', exerciseId: 'm-leg-press', equipmentId: 'eq1', setIndex: 0, isWarmup: true, weightKg: 60, reps: 12, seq: 1, completedAt: '2026-10-30T10:00:00+08:00' },
  { id: 'b', workoutId: 'w0', exerciseId: 'm-leg-press', equipmentId: 'eq1', setIndex: 1, isWarmup: false, weightKg: 100, reps: 12, seq: 2, completedAt: '2026-10-30T10:02:00+08:00' },
]

describe('prefillRows', () => {
  it('copies last session as ghost rows', () => {
    const rows = prefillRows(legPress, eq, 'w1', last)
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.ghost === true)).toBe(true)
    expect(rows.every((r) => r.completedAt === undefined)).toBe(true)
    expect(rows[0].isWarmup).toBe(true)
    expect(rows[1]).toMatchObject({ weightKg: 100, reps: 12, workoutId: 'w1' })
  })
  it('creates one real default row with no history', () => {
    const rows = prefillRows(legPress, eq, 'w1', [])
    expect(rows).toHaveLength(1)
    expect(rows[0].ghost).toBeUndefined()
    expect(rows[0]).toMatchObject({ weightKg: 2.5, reps: 10 })
  })
})

describe('formatLast', () => {
  it('ignores nothing new: same output as before', () => {
    expect(formatLast(legPress, last)).toBe('Last: 100 kg × 12')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/history.test.ts`
Expected: FAIL, `ghost` is undefined on copied rows (and a type error on `cues`/`visualId` until types change).

- [ ] **Step 4: Change types, schema, seed and prefill**

- `src/types.ts`: add `ghost?: boolean` to `SetRow`; add `cues: string[]` and `visualId: string | null` to `Exercise`.
- `src/db.ts`: add `this.version(2).stores({...})` with the identical store map after version 1.
- `src/data/seed.json`: Leg Press `defaultIncrementKg: 2.5`; add `"cues": [], "visualId": null` to all 31 exercises (a short Python one-liner is fine).
- `src/history.ts` `prefillRows`: spread `ghost: true` into each copied row.
- `CustomMachineSheet.tsx`: add `cues: []`, `visualId: null` to the created exercise.

- [ ] **Step 5: Run tests and type-check**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all PASS, no type errors.

- [ ] **Step 6: Commit (if allowed)**

```bash
git add package.json package-lock.json src/types.ts src/db.ts src/data/seed.json src/history.ts src/history.test.ts src/screens/CustomMachineSheet.tsx
git commit -m "feat: ghost prefill rows, cues and visualId fields, Vitest"
```

---

### Task 2: Design system foundation, font, history layers, bottom sheet

**Files:**
- Create: `scripts/fetch_font.py`
- Create: `src/assets/fonts/Manrope.woff2`, `src/assets/fonts/OFL.txt`
- Create: `src/nav.ts`
- Create: `src/components/BottomSheet.tsx`
- Modify: `src/styles.css` (rewrite tokens and base styles; keep every existing class name working until its screen is restyled)
- Modify: `src/App.tsx` (use `nav.ts` instead of its own pushState logic)
- Modify: `index.html:6` (theme-color `#0b0b0d`), `vite.config.ts` (manifest colours `#0b0b0d`; globPatterns add `woff2,webp`)

**Interfaces:**
- Produces: `pushLayer(onBack: () => void): void` and `popLayer(): void` in `src/nav.ts`. `pushLayer` calls `history.pushState` and records `onBack`; a single `popstate` listener pops the top entry and calls its `onBack`. `popLayer` calls `history.back()` when the stack is non-empty.
- Produces: `<BottomSheet open onClose title? height? children>` in `src/components/BottomSheet.tsx`. On open it calls `pushLayer(onClose)`; closing via button calls `popLayer()`. Renders scrim and sheet with the spec's radii and 240 ms slide. `height` is `'auto' | 'tall'` (tall = 90vh).

- [ ] **Step 1: Fetch the font**

`scripts/fetch_font.py`: request `https://fonts.googleapis.com/css2?family=Manrope:wght@500..800&display=swap` with a Chrome desktop `User-Agent`, take the `/* latin */` block's `url(...)`, download it to `src/assets/fonts/Manrope.woff2`, and download the OFL from `https://raw.githubusercontent.com/google/fonts/main/ofl/manrope/OFL.txt` next to it. Print the byte size.

Run: `python3 -I scripts/fetch_font.py`
Expected: one woff2 under 60 KB, OFL.txt present.

- [ ] **Step 2: Write `src/nav.ts`**

Signatures in Interfaces. Export also `screenLayer()` helpers if App needs them; App's existing `pushed` ref logic is replaced: opening a screen calls `pushLayer(() => setScreen({ name: 'home' }))`, `goHome` calls `popLayer()`.

- [ ] **Step 3: Write `src/components/BottomSheet.tsx`**

Props per Interfaces. Scrim `rgba(0,0,0,.55)`, sheet `--card`, top radius 28 px, padding `10px 18px calc(26px + env(safe-area-inset-bottom))`, grab handle 40×4 px. Tapping the scrim closes. Uses CSS classes `sheet-scrim`, `sheet`, `sheet.tall`.

- [ ] **Step 4: Rewrite tokens and base styles in `src/styles.css`**

Replace `:root` with the spec's tokens (`--bg #0b0b0d`, `--card #141418`, `--raised #1c1c21`, `--line #1f1f25`, `--text #f4f4f6`, `--muted` chosen for 4.5:1 on both `--card` and `--raised`, `--accent #30d158`, `--accent-soft #15201a`, `--accent-text #04230d`, `--warn #ffb340`, `--warn-bg #2a2416`, `--danger #ff6961`, `--tap 56px`, radii `--r-card 20px`, `--r-ctl 12px`, `--r-btn 18px`). Add `@font-face { font-family: Manrope; font-weight: 500 800; src: url('./assets/fonts/Manrope.woff2') format('woff2'); font-display: swap }` and set body font to `Manrope, system-ui, -apple-system, Roboto, sans-serif`, body size 15 px / weight 500. Section label class `.lbl` (11.5 px, 700, uppercase, 0.08em). Buttons: `.btn` 56 px, radius 18; `.btn.primary` accent; `.btn.secondary` raised; `.btn.quiet` 1.5 px `#2a2a30` border, muted text. Add `.sheet-scrim`, `.sheet`, `.sheet.tall`, slide-up keyframes, and a `@media (prefers-reduced-motion: reduce)` block that zeroes transition and animation durations. Keep all other existing selectors so unrestyled screens still work.

Verify contrast of the chosen `--muted` with a quick script or `https://webaim.org/resources/contrastchecker/` values; record the final hex in a CSS comment.

- [ ] **Step 5: Manifest and meta colours, precache globs**

`vite.config.ts`: `theme_color` and `background_color` → `#0b0b0d`; `globPatterns: ['**/*.{js,css,html,png,svg,woff2,webp}']`. `index.html`: `theme-color` → `#0b0b0d`.

- [ ] **Step 6: Verify in the browser**

Run `npx tsc --noEmit`. Start `gym-log-dev` via preview and open `/gym-log/`. Expected: Home renders in Manrope on `#0b0b0d`, no console errors, `document.fonts.check('500 15px Manrope')` returns true in `javascript_tool`. Open Cardio, press Android back (or `history.back()`): returns Home.

- [ ] **Step 7: Commit (if allowed)**

```bash
git add scripts/fetch_font.py src/assets/fonts src/nav.ts src/components/BottomSheet.tsx src/styles.css src/App.tsx index.html vite.config.ts
git commit -m "feat: Fitness dark tokens, Manrope, history layers, BottomSheet"
```

---

### Task 3: Home restyle

**Files:**
- Modify: `src/screens/Home.tsx`
- Modify: `src/styles.css` (home section)

**Interfaces:**
- Consumes: `.btn` classes and `.lbl` from Task 2.
- Produces: nothing new. Export button still calls `exportJson()` until Task 7 replaces it with the sheet.

- [ ] **Step 1: Rebuild Home per spec**

Header: today's date (`sgDate()` formatted "Sat 31 Oct") as `.lbl`. Outlet chooser: wrapping `.chip` row (56 px chips, short names, `aria-pressed`), selected chip accent; disabled while a workout is active. Start/Resume button 72 px primary. Cardio and Bodyweight as two `.btn.secondary` in a grid. Past workouts as `.card` rows (date, outlet or "Cardio · Zone 2", count or modality, duration). Export JSON as `.btn.secondary` full width at the bottom.

- [ ] **Step 2: Verify in the browser**

Expected at 360 px (`resize_window` width 360) and at 412 px: chips wrap to two rows without horizontal scroll; every button ≥ 56 px tall (check `getBoundingClientRect().height` on the chips and buttons via `javascript_tool`); last used outlet preselected after reload.

- [ ] **Step 3: Commit (if allowed)**

```bash
git add src/screens/Home.tsx src/styles.css
git commit -m "feat: Home in Fitness dark with outlet chips"
```

---

### Task 4: Workout screen: header, cards, ghost rows, step pill, Finish at bottom

**Files:**
- Create: `src/components/StepPill.tsx`
- Create: `src/components/Thumb.tsx`
- Modify: `src/screens/Workout.tsx`
- Modify: `src/components/Stepper.tsx` (restyle only: `.step-btn` 56 px tall, min width 48; value 22 px / 800)
- Modify: `src/styles.css` (workout section)
- Test: `src/history.test.ts` (add `countSets`)

**Interfaces:**
- Produces: `countSets(rows: SetRow[]): { done: number; total: number }` in `src/history.ts`. `total` = all rows, `done` = rows with `completedAt`.
- Produces: `<StepPill value onChange>` in `src/components/StepPill.tsx`: renders "step {value}"; tap expands an inline chip row `[1.25, 2.5, 5, 10, 'custom']`; choosing calls `onChange(kg: number)` and collapses. Custom opens a numeric input, commits on Enter or blur.
- Produces: `<Thumb ex size>` in `src/components/Thumb.tsx`: renders `<img src={`${import.meta.env.BASE_URL}visuals/${ex.id}.webp`}>` when `ex.visualId` is non-null, else a `--raised` tile with the first letter of `ex.name`. `size` is 64 or 44.
- Consumes: `BottomSheet`, `pushLayer` from Task 2 (Finish opens a sheet in Task 6; in this task Finish keeps today's `confirm()` temporarily).

- [ ] **Step 1: Write the failing test**

```ts
describe('countSets', () => {
  it('counts ghost rows in total and completed rows in done', () => {
    const rows: SetRow[] = [
      { ...last[0], ghost: true, completedAt: undefined },
      { ...last[1], completedAt: '2026-10-31T10:00:00+08:00' },
    ]
    expect(countSets(rows)).toEqual({ done: 1, total: 2 })
    expect(countSets([])).toEqual({ done: 0, total: 0 })
  })
})
```

- [ ] **Step 2: Run, expect FAIL** (`countSets` not exported).

- [ ] **Step 3: Implement `countSets` in `src/history.ts`.** Run tests, expect PASS.

- [ ] **Step 4: Rebuild `Workout.tsx` layout**

- Sticky header: left `.lbl` outlet + 34 px / 800 timer; right pill `"{done} of {total} sets"` or `"0 sets"`. Under it a 6 px `.progress` with inner width `done/total*100%`, 240 ms transition. Remove Finish from the header.
- Card top row: `<Thumb ex size={64}>`, name (19 px / 800), and `<StepPill>` only when `keyedByEquipment(ex)`; `onChange` writes `db.equipment.update(eq.id, { stackStepKg })` and updates local state so `weightStep` changes immediately.
- "Last" line: load in `--text`, rest muted, from `formatLast` split on the first `×` (or render `formatLast` output in muted with the load span bold; builder's choice as long as the load reads in `--text`).
- Set row grid: `56px minmax(0,1fr) 56px`; badge and ✓ stretch full height; middle column stacks weight control over reps/seconds, each 56 px tall. Done rows: `.set-row.done` background `--accent-soft`, ✓ accent fill.
- Ghost rows: `.set-row.ghost` opacity 0.45 and `outline: 1.5px dashed #3a3a42` on controls and ✓. `toggleDone` on a ghost writes `{ ...row, ghost: false, completedAt: sgIso() }`. Any `onChange` from a stepper, chip or the W badge on a ghost writes `{ ...row, ghost: false, ...patch }`.
- `addSet`: duplicate last real row if any, else last ghost; new row has no `ghost`.
- `removeLastSet`: unchanged rule (refuses on completed), ghost rows removable.
- `finish`: also `bulkDelete` ghost rows; otherwise as today. Keep `confirm()` for now.
- Below cards: "+ Add exercise" (`.btn.secondary`, 60 px), note field, 24 px gap, "Finish workout" `.btn.quiet` 56 px.

- [ ] **Step 5: Verify in the browser**

With a finished Leg Press workout in IndexedDB (log one through the UI first): start a new workout at the same outlet, add Leg Press. Expected: faint dashed rows with last values; pill reads "0 of N sets"; tapping ✓ on a ghost makes it solid and green, pill goes to "1 of N"; changing a stepper on a ghost makes it solid but not green; "+ Set" adds a solid row copying the last real row; reload the page mid-workout and the ghosts are still faint; step pill on Leg Press reads "step 2.5" and choosing 5 makes + jump by 5. Check every control height ≥ 56 via `javascript_tool`. No Finish in the header; Finish is last on the page.

- [ ] **Step 6: Commit (if allowed)**

```bash
git add src/components/StepPill.tsx src/components/Thumb.tsx src/components/Stepper.tsx src/screens/Workout.tsx src/history.ts src/history.test.ts src/styles.css
git commit -m "feat: Workout in Fitness dark with ghost rows, step pill, Finish at bottom"
```

---

### Task 5: Kettlebell chips with history and custom weight

**Files:**
- Create: `src/weights.ts`
- Modify: `src/components/BellChips.tsx`
- Modify: `src/history.ts` (`distinctWeights`)
- Modify: `src/screens/Workout.tsx` (pass `extra` sizes)
- Test: `src/weights.test.ts`

**Interfaces:**
- Produces: `parseWeight(text: string): number | null` in `src/weights.ts`: trims, accepts decimal with `.` or `,`, returns a positive finite number rounded to 2 dp, else `null`.
- Produces: `bellSizes(seed: number[], used: number[]): number[]`: sorted ascending union without duplicates.
- Produces: `distinctWeights(exerciseId: string): Promise<number[]>` in `src/history.ts`: distinct `weightKg` of completed sets for that exercise.
- Produces: `<BellChips value extra onChange>`; chips = `bellSizes(kettlebellSizesKg, extra)` plus trailing "…" chip that swaps to a numeric input (`inputmode="decimal"`, autofocus, 56 px); commit via `parseWeight`, `null` keeps the current value and closes.

- [ ] **Step 1: Write the failing tests**

```ts
// src/weights.test.ts
import { describe, it, expect } from 'vitest'
import { parseWeight, bellSizes } from './weights'

describe('parseWeight', () => {
  it('accepts positive decimals', () => {
    expect(parseWeight('18')).toBe(18)
    expect(parseWeight(' 17,5 ')).toBe(17.5)
  })
  it('rejects empty, zero, negative and junk', () => {
    for (const s of ['', '0', '-4', 'abc', 'NaN', 'Infinity']) expect(parseWeight(s)).toBeNull()
  })
})

describe('bellSizes', () => {
  it('unions and sorts', () => {
    expect(bellSizes([8, 12, 16], [18, 12, 10])).toEqual([8, 10, 12, 16, 18])
  })
})
```

- [ ] **Step 2: Run, expect FAIL.** Then implement `src/weights.ts`. Run, expect PASS.

- [ ] **Step 3: Implement `distinctWeights` and wire `BellChips`**

Workout loads `distinctWeights(ex.id)` for each kettlebell exercise on the page and passes as `extra`. Chip row: `overflow-x: auto`, `scroll-snap-type: x proximity`, chips 56 px tall, min width 56.

- [ ] **Step 4: Verify in the browser**

Add Kettlebell Swing. Tap "…", type 18, Enter: 18 is selected. Tick, finish, start another workout, add Kettlebell Swing: an 18 chip is present between 16 and 20. Typing "abc" in "…" leaves the weight unchanged.

- [ ] **Step 5: Commit (if allowed)**

```bash
git add src/weights.ts src/weights.test.ts src/components/BellChips.tsx src/history.ts src/screens/Workout.tsx src/styles.css
git commit -m "feat: kettlebell chips remember odd sizes and accept custom weights"
```

---

### Task 6: Finish sheet

**Files:**
- Create: `src/summary.ts`
- Create: `src/screens/FinishSheet.tsx`
- Modify: `src/screens/Workout.tsx` (Finish opens the sheet; `finish()` called from the sheet)
- Test: `src/summary.test.ts`

**Interfaces:**
- Produces in `src/summary.ts`:
  - `volumeKg(rows: SetRow[], exercises: Record<string, Exercise>): number` per spec: completed, non-warm-up, both `weightKg` and `reps` present; `per_hand` ×2; `bodyweight_plus` counts weightKg as is (added kg); `timed` contributes 0.
  - `summarize(rows: SetRow[], exercises: Record<string, Exercise>): { done: number; volumeKg: number; lines: { name: string; text: string }[]; untickedReal: { count: number; exerciseName?: string }; nothingLogged: boolean }`. `lines` use `formatLast` on completed rows per exercise with the "Last: " prefix stripped. `untickedReal` counts rows without `completedAt` and without `ghost`; `exerciseName` set when all of them belong to one exercise. `nothingLogged` is `done === 0`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/summary.test.ts
import { describe, it, expect } from 'vitest'
import { volumeKg, summarize } from './summary'
// reuse legPress fixture; add dbBench (per_hand), pushUp (bodyweight_plus), plank (timed) fixtures

describe('volumeKg', () => {
  it('sums working sets, doubles per-hand, ignores timed and warm-ups', () => {
    const rows = [
      done(legPress.id, { weightKg: 100, reps: 10 }),
      done(legPress.id, { weightKg: 60, reps: 10, isWarmup: true }),
      done(dbBench.id, { weightKg: 26, reps: 10 }),
      done(plank.id, { durationSec: 45 }),
      done(pushUp.id, { weightKg: 0, reps: 15 }),
    ]
    expect(volumeKg(rows, ex)).toBe(1000 + 520)
  })
  it('skips rows missing weight or reps', () => {
    expect(volumeKg([done(legPress.id, { reps: 10 })], ex)).toBe(0)
  })
})

describe('summarize', () => {
  it('reports nothing logged when only ghost rows exist', () => {
    const s = summarize([{ ...ghostRow }], ex)
    expect(s.nothingLogged).toBe(true)
    expect(s.untickedReal.count).toBe(0)
  })
  it('names the exercise when all unticked rows are on one exercise', () => {
    const s = summarize([done(legPress.id, { weightKg: 100, reps: 12 }), open(latPull.id, { weightKg: 55, reps: 12 })], ex)
    expect(s.untickedReal).toEqual({ count: 1, exerciseName: 'Lat Pulldown' })
    expect(s.lines[0]).toEqual({ name: 'Leg Press', text: '100 kg × 12' })
  })
})
```

`done()`/`open()`/`ghostRow` are small fixture helpers in the test file.

- [ ] **Step 2: Run, expect FAIL.** Implement `src/summary.ts`. Run, expect PASS.

- [ ] **Step 3: Build `FinishSheet.tsx`**

Props: `{ open, onClose, rows, exercises, startedAt, onFinish }`. Uses `BottomSheet`. Title "Finish workout?"; three `.stat` tiles (duration mm:ss from `startedAt` to now, `done`, `volumeKg` formatted with thousands separator and a muted "kg"); `lines`; warn line `"{count} unticked set(s){ on {exerciseName}} will be discarded"` when count > 0; when `nothingLogged`: "Nothing logged. This workout will be discarded."; buttons "Keep going" (`.btn.secondary`) and "Finish" (`.btn.primary`) in a `1fr 1.4fr` grid.

- [ ] **Step 4: Wire into Workout**

Replace `confirm()` with sheet state. `onFinish` runs the existing finish logic (delete unticked and ghost rows, delete empty workout, set `endedAt`) then `onDone()`.

- [ ] **Step 5: Verify in the browser**

Workout with 2 ticked Leg Press sets, 1 unticked Lat Pulldown row, 1 ghost: sheet shows 2 sets, volume, one line for Leg Press, warning naming Lat Pulldown. Keep going closes; `history.back()` closes; Finish returns Home and the past list shows the workout. New workout with no ticks: sheet reads "Nothing logged…", Finish removes it.

- [ ] **Step 6: Commit (if allowed)**

```bash
git add src/summary.ts src/summary.test.ts src/screens/FinishSheet.tsx src/screens/Workout.tsx src/styles.css
git commit -m "feat: finish sheet with summary, volume and discard warning"
```

---

### Task 7: Export sheet

**Files:**
- Modify: `src/export.ts` (split into `buildExportFile(): Promise<File>` and actions)
- Create: `src/screens/ExportSheet.tsx`
- Modify: `src/screens/Home.tsx` (Export opens the sheet)

**Interfaces:**
- Produces in `src/export.ts`: `buildExportFile(): Promise<File>` (name `gymlog-YYYY-MM-DD.json`, type `application/json`); `shareOrDownload(file: File): Promise<void>` (today's share-then-anchor logic); `copyText(text: string): Promise<boolean>` (true on clipboard success, false when `navigator.clipboard` is missing or throws).
- Produces: `<ExportSheet open onClose>`: shows file name and size in KB; buttons "Share or download" and "Copy JSON"; on copy failure reveals a read-only `<textarea>` with the JSON and a "Select all" button that calls `select()` on it.

- [ ] **Step 1: Refactor `export.ts` into the three functions.** `buildExport()` stays as is. Run `npx tsc --noEmit`.

- [ ] **Step 2: Build `ExportSheet.tsx` and wire Home.**

- [ ] **Step 3: Verify in the browser**

On `http://localhost:5173/gym-log/`: Copy JSON shows "Copied" and the clipboard holds JSON starting with `{"schema":"gymlog/1"`. On `http://192.168.68.57:5173/gym-log/` from the built-in browser: Copy fails and the textarea appears with the JSON; Select all highlights it. Share or download still attempts the anchor download.

- [ ] **Step 4: Commit (if allowed)**

```bash
git add src/export.ts src/screens/ExportSheet.tsx src/screens/Home.tsx src/styles.css
git commit -m "feat: export sheet with copy and plain-http fallback"
```

---

### Task 8: Cardio redesign and 4x4 helpers

**Files:**
- Create: `src/cardio.ts`
- Modify: `src/screens/Cardio.tsx` (rewrite)
- Test: `src/cardio.test.ts`

**Interfaces:**
- Produces in `src/cardio.ts`:
  - `timeline(durationMin: number, workMin: number, restMin: number, intervals: number): { warmupMin: number; coolMin: number; segments: { kind: 'warmup' | 'work' | 'rest' | 'cool'; min: number }[] }`. Warm-up and cool-down each `max(0, (durationMin - intervals*workMin - (intervals-1)*restMin) / 2)`, rounded to nearest minute for display but kept exact in `min`.
  - `applyShared(intervals: Interval[], key: 'speedKph' | 'inclinePct', prev: number | undefined, next: number | undefined): Interval[]`: returns intervals where `iv[key] === prev` get `next`; others unchanged.
  - `isOverridden(iv: Interval, key, shared: number | undefined): boolean`: `iv[key] !== undefined && iv[key] !== shared`.
  - `prefillFrom(last: CardioSession): Omit<CardioSession, 'id' | 'workoutId'>`: copies `modality, durationMin, speedKph, inclinePct`, and `intervals` with `peakHr` removed; drops `avgHr, maxHr, rpe, notes`.
- Modify `defaultsFor` so new 4x4 intervals carry the shared speed and incline (6.0 km/h, 10 %) from the form, and `speedKph`/`inclinePct` on the session hold the shared values for 4x4 too.

- [ ] **Step 1: Write the failing tests**

```ts
// src/cardio.test.ts
import { describe, it, expect } from 'vitest'
import { timeline, applyShared, isOverridden, prefillFrom } from './cardio'

describe('timeline', () => {
  it('splits the remainder into warm-up and cool-down', () => {
    const t = timeline(38, 4, 3, 4)
    expect(t.warmupMin).toBe(6.5)
    expect(t.coolMin).toBe(6.5)
    expect(t.segments.map((s) => s.kind)).toEqual(['warmup', 'work', 'rest', 'work', 'rest', 'work', 'rest', 'work', 'cool'])
  })
  it('clamps at zero when the duration is too short', () => {
    expect(timeline(20, 4, 3, 4).warmupMin).toBe(0)
  })
})

describe('applyShared', () => {
  it('rewrites inherited rows and keeps overrides', () => {
    const ivs = [{ workMin: 4, speedKph: 6.2 }, { workMin: 4, speedKph: 6.5 }, { workMin: 4, speedKph: 6.2 }]
    expect(applyShared(ivs, 'speedKph', 6.2, 6.4).map((i) => i.speedKph)).toEqual([6.4, 6.5, 6.4])
  })
})

describe('isOverridden', () => {
  it('is true only when the row differs from the shared value', () => {
    expect(isOverridden({ workMin: 4, speedKph: 6.5 }, 'speedKph', 6.2)).toBe(true)
    expect(isOverridden({ workMin: 4, speedKph: 6.2 }, 'speedKph', 6.2)).toBe(false)
  })
})

describe('prefillFrom', () => {
  it('keeps the plan and drops the measurements', () => {
    const f = prefillFrom({ id: 'c', workoutId: 'w', modality: 'treadmill_4x4', durationMin: 38, speedKph: 6.2, inclinePct: 10, avgHr: 150, maxHr: 170, rpe: 8, notes: 'x', intervals: [{ workMin: 4, speedKph: 6.5, inclinePct: 10, peakHr: 168 }] })
    expect(f).toEqual({ modality: 'treadmill_4x4', durationMin: 38, speedKph: 6.2, inclinePct: 10, intervals: [{ workMin: 4, speedKph: 6.5, inclinePct: 10 }] })
  })
})
```

- [ ] **Step 2: Run, expect FAIL.** Implement `src/cardio.ts`. Run, expect PASS.

- [ ] **Step 3: Rewrite `Cardio.tsx` per spec**

Segmented control (`.seg`, three 42 px+ segments inside a 56 px track). Zone 2 and Bike: label + stepper rows. 4x4: Session card with `timeline(...)` drawn as flex segments (work accent, rest raised, warm-up/cool `#22222a`) and the label line "warm-up {w} · work 4 · rest 3 · ×4 · cool {c}". Work intervals card: Speed and Incline steppers whose `onChange` calls `applyShared` on the intervals and updates the shared value. Interval table card: grid `28px 1fr 1fr 1.2fr`; inherited cells muted text, tap swaps that cell to a stepper bound to that interval and shows an accent dot when `isOverridden`; Peak HR stepper per row, `optional`, start 160. Avg HR, Max HR steppers. RPE: five chips 6 to 10 in a 56 px row, tap selected to clear. Note. Save. `pickModality` uses `prefillFrom(latest)` or `defaultsFor`.

- [ ] **Step 4: Verify in the browser**

4x4: set speed 6.2 and incline 10 once; tapping peak HR + on each of four rows logs the session with 8 taps plus save. Tap interval 3's speed, change to 6.5, dot appears; change shared speed to 6.4: rows 1, 2, 4 follow, row 3 stays 6.5. Save, export, confirm `intervals[2].speedKph === 6.5` in the JSON. Reopen Cardio, 4x4: speed, incline and the override are prefilled; HR fields and RPE empty. Duration 20 shows zero warm-up.

- [ ] **Step 5: Commit (if allowed)**

```bash
git add src/cardio.ts src/cardio.test.ts src/screens/Cardio.tsx src/styles.css
git commit -m "feat: cardio redesign with 4x4 timeline, shared settings and overrides"
```

---

### Task 9: Picker, custom machine sheet, bodyweight restyle

**Files:**
- Modify: `src/screens/Picker.tsx`, `src/screens/CustomMachineSheet.tsx`, `src/screens/BodyweightEntry.tsx`, `src/styles.css`

**Interfaces:**
- Consumes: `Thumb` (size 44), `BottomSheet`, `pushLayer`.

- [ ] **Step 1: Picker**: overlay slides up (reuse the sheet keyframes), registers `pushLayer(onClose)` so back closes it; search 56 px; list items 56 px with `<Thumb size={44}>` on the left, caution pills on the right; sections unchanged.

- [ ] **Step 2: Custom machine sheet**: render inside `BottomSheet`; step chips `[1.25, 2.5, 5, 10, 'custom']`; fields unchanged; "Save & add" primary.

- [ ] **Step 3: Bodyweight**: restyle rows and buttons; no behaviour change.

- [ ] **Step 4: Verify in the browser**

Picker opens and back closes it without leaving the workout. Custom machine still takes under 15 seconds end to end (time it). Bodyweight saves and lists.

- [ ] **Step 5: Commit (if allowed)**

```bash
git add src/screens/Picker.tsx src/screens/CustomMachineSheet.tsx src/screens/BodyweightEntry.tsx src/styles.css
git commit -m "feat: picker, custom machine and bodyweight in Fitness dark"
```

---

### Task 10: Technique visuals pipeline

**Files:**
- Create: `scripts/fetch_visuals.py`
- Modify: `src/data/seed.json` (`visualId` per matched exercise; `cues` for all 31)
- Create: `public/visuals/*.webp`
- Modify: `README.md` (asset provenance line), `HANDOFF.md` (unmatched list)

**Interfaces:**
- Produces: `public/visuals/<seed exercise id>.webp` for every exercise with a non-null `visualId`. `Thumb` and the technique sheet (Task 11) load them by that path.

- [ ] **Step 1: Map exercises to the free API**

Open `https://oss.exercisedb.dev/docs` for the search or list endpoint (list is `GET /api/v1/exercises`, single is `GET /api/v1/exercises/{exerciseId}`). For each of the 31 seed exercises find the closest variant and record its `exerciseId` in `visualId`. Leave `null` where nothing matches and list those names in HANDOFF.md.

- [ ] **Step 2: Write the cues**

For each exercise, 3 to 5 lines, each at most about 70 characters, imperative, derived from the exercise `note`, its caution flags and the API's `instructions`. Caution lines start with `!`. Example for Leg Press: `["!Keep lower back on the pad. Don't chase depth.", "Feet shoulder width, mid-platform, toes slightly out.", "Lower until knees pass 90°, heels stay down.", "Drive through mid-foot, don't lock the knees.", "!If the knee complains, raise the feet and shorten the range."]`.

- [ ] **Step 3: Write `scripts/fetch_visuals.py`**

Checks `import PIL` (prints the `pip3 install --user pillow` hint if missing). For each exercise with `visualId`: fetch the exercise JSON, download `gifUrl`, open with Pillow, iterate frames (`ImageSequence`), convert each to RGBA, set alpha 0 where R, G and B are all > 235, compute the union bounding box of opaque pixels across frames, crop all frames to it with 6% padding, save as animated WebP (`save_all=True`, `quality=80`, `duration` from the GIF frame durations, `loop=0`) to `public/visuals/<id>.webp`. Print per-file and total size; exit non-zero if the total exceeds 5 MB.

- [ ] **Step 4: Run it**

Run: `python3 -I scripts/fetch_visuals.py`
Expected: one WebP per mapped exercise, total well under 5 MB (180 px sources), no errors. Open one in the browser pane to confirm it loops on a black background with no white box.

- [ ] **Step 5: README and HANDOFF**

README: "Technique visuals in `public/visuals/` are prototype assets from the free ExerciseDB tier for personal use; replace with a licensed pack before any wider distribution." HANDOFF: the unmatched exercise list and how to rerun the script.

- [ ] **Step 6: Commit (if allowed)**

```bash
git add scripts/fetch_visuals.py src/data/seed.json public/visuals README.md HANDOFF.md
git commit -m "feat: technique visuals pipeline, cues and visual ids"
```

---

### Task 11: Technique sheet and thumbnails

**Files:**
- Create: `src/screens/TechniqueSheet.tsx`
- Modify: `src/screens/Workout.tsx` (open on thumbnail or name tap)

**Interfaces:**
- Consumes: `BottomSheet` (`height="tall"`), `Thumb`, `Exercise.cues`, `Exercise.visualId`.
- Produces: `<TechniqueSheet ex open onClose>`.

- [ ] **Step 1: Build the sheet**

Title `ex.name`. Pill row: `primaryMuscles.join(' · ')`, `"{min}–{max} reps"` (or `"{min}–{max} s"` for timed), load mode pill when not `total` ("per hand", "+ kg", "seconds"), warn pills "Back" / "Knee" from the flags. Media slot: 4:3, black, radius 18; `<img src=visual loop>` with `object-fit: contain` when `visualId`, else a `--raised` placeholder with "No animation yet". Cue list: lines starting with `!` get a warn badge and the `!` stripped; others numbered. "Watch on YouTube" `.btn.quiet` → `window.open('https://www.youtube.com/results?search_query=' + encodeURIComponent(ex.name + ' form'), '_blank', 'noopener')`. "Done" closes.

- [ ] **Step 2: Wire Workout**: tapping `Thumb` or the name sets `techniqueFor = ex`.

- [ ] **Step 3: Verify in the browser**

Leg Press sheet shows the animation looping, cues with two warn badges, Back and Knee pills. A custom machine shows the placeholder and the YouTube button only. Back closes the sheet and stays on the workout. With the dev server stopped and the built app served (`npm run build && npx vite preview --host`), load once, go offline in DevTools, reload: the sheet and animation still work.

- [ ] **Step 4: Commit (if allowed)**

```bash
git add src/screens/TechniqueSheet.tsx src/screens/Workout.tsx src/styles.css
git commit -m "feat: technique sheet with animation, cues and caution pills"
```

---

### Task 12: Motion, polish, build and handoff

**Files:**
- Modify: `src/styles.css` (motion), `src/screens/Workout.tsx` (✓ animation class toggle), `HANDOFF.md`

- [ ] **Step 1: Motion**

✓ tap: add a `.pop` class for 160 ms (`transform: scale(.9)` keyframe) and transition `background-color` 160 ms on `.set-row`; ghost→real transitions `opacity` 160 ms; sheets already 240 ms. Confirm the reduced-motion block covers all of them.

- [ ] **Step 2: Full checks**

Run: `npx vitest run && npm run build`
Expected: all tests pass; build succeeds; `dist` includes `assets/*.woff2` and `visuals/*.webp`; the generated `sw.js` precache manifest lists them (grep `woff2` and `webp` in `dist/sw.js`).

- [ ] **Step 3: Size and target audit**

`du -sh dist/visuals dist/assets/*.woff2` under 5 MB total. In the browser at 360 px, run a `javascript_tool` snippet that lists every `button` and `input` whose `getBoundingClientRect().height < 56` on Home, Workout, Cardio and the picker. Expected: none (apart from chips inside a 56 px scroll row, which must themselves be 56).

- [ ] **Step 4: HANDOFF.md**

Replace the "Still to do" list: click-through of the redesign by Shafi, then the on-phone acceptance test (airplane mode, installed PWA) after he approves deployment. Note the mockup folder, the asset provenance and the unmatched visuals.

- [ ] **Step 5: Commit (if allowed)**

```bash
git add src/styles.css src/screens/Workout.tsx HANDOFF.md
git commit -m "feat: motion polish and handoff notes for the redesign"
```

---

## Self-review notes

- Spec coverage: Home (T3), Workout header/cards/ghost/step pill/Finish placement (T4), kettlebell (T5), finish sheet (T6), export sheet (T7), cardio and 4x4 (T8), picker/custom/bodyweight (T9), visuals pipeline and cues (T10), technique sheet (T11), design system/fonts/manifest/back handling (T2), data changes (T1), motion and reduced motion (T2, T12), acceptance checks mapped to browser steps in each task.
- Names used consistently: `prefillRows`, `countSets`, `distinctWeights` (history.ts); `parseWeight`, `bellSizes` (weights.ts); `volumeKg`, `summarize` (summary.ts); `timeline`, `applyShared`, `isOverridden`, `prefillFrom` (cardio.ts); `pushLayer`, `popLayer` (nav.ts); components `BottomSheet`, `StepPill`, `Thumb`, `BellChips`, `FinishSheet`, `ExportSheet`, `TechniqueSheet`.
- Proportion: UI tasks are described by layout rules and browser checks, not code; only pure helpers carry test code.
