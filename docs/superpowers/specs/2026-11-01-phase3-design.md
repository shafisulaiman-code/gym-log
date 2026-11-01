# Phase 3: coaching rules

Date: 2026-11-01. Status: approved by Shafi on 1 Nov 2026 ("Approved"). Nothing here is built yet. Builds on PLAN.md, the Phase 1 specs and the Phase 2 spec in this folder; where this document is silent, those apply.

## Intent

Phase 2 is live and accepted (1 Nov 2026). Shafi's aim for the data has always been to get past a plateau. Brainstormed with him on 1 Nov 2026, and the moment that shaped this phase: when he opens an exercise card he reads the "Last" line, checks how his body feels, and on an ordinary day loads the same weight as last time. The weight only moves on the rare day he feels strong, so months pass with the numbers sitting still.

Phase 3 closes that gap with rules, not a model (in-app AI is on PLAN.md's do-not-build list). Three pieces:

1. **The nudge**: one line on the exercise card that states today's target, load and reps together, in a conditional voice ("Feeling good? 102.5 × 10"). One tap sets the ghost rows to it. The rule behind it is double progression, reps first then weight, gated by the RPE he already records.
2. **The coach card** on Home, shown only when it has something to say: PRs this week, stalled lifts, and when a light week is due. Tapping a row opens a history sheet for that lift with an estimated one-rep max sparkline.
3. **The weekly file** carries the same estimates and flags so the claude.ai Project sees what he saw.

Shafi said he is new to programming his own training and will follow what the coach says, so the rules below are chosen to be sound and conservative rather than clever. Straight sets (same weight, same rep target for every working set) are the assumption throughout.

## Goals

- Every exercise with history shows one clear target for today, and acting on it costs one tap.
- The target follows a rule a coach would recognise: reps up to the top of the range, then one step of weight, held when effort was maximal, dropped after two short sessions, reset after a stall.
- Before Start, Home tells him which lifts are stalled, which got a PR this week, and when a light week is due. Nothing shows on a quiet week.
- A tap on any lift shows its last twelve sessions and the trend of its estimated one-rep max.
- A light week is one tap to start and runs itself for seven days.
- The weekly Markdown carries the estimates, the flags and hard sets per muscle.

## Non-goals

- Any model, chat, or text generation. Every line of coaching text is a fixed template over computed numbers.
- Editing rep ranges, steps or rule thresholds from the app. The seed's `repRange` and the step pill are the only inputs he adjusts. No settings screen (PLAN.md).
- Per-set RPE. Effort stays one rating per exercise per session, as Phase 2 built it.
- Notifications, reminders, or anything that calls him back to the app.
- Bodyweight-based one-rep max for bodyweight exercises (see Estimates).
- Supersets, circuits, Sheet sync (Phase 4), and anything on PLAN.md's do-not-build list.
- Cardio coaching. The rules apply to strength sets only.

## Anti-goals

- A nudge that reads as an order, or that nags. The voice is a conditional offer; ignoring it records nothing and changes nothing.
- A second tap between him and the ✓. The nudge sits above the set rows and never touches the dock.
- A rule that pushes the load up while reps fall under the range, or that yo-yos. Weight moves one step at a time and only on evidence.
- Numbers invented for the Project: every estimate carries its rough marker when it came from high reps.
- Network use. Everything here works in airplane mode.

## Constraints

- Stack and rules from PLAN.md: Vite, React, TypeScript, Dexie, plain CSS, no component library, 56 px tap targets, one dark theme, no accounts, no sync. Tokens, type scale and motion from the Phase 1 redesign spec.
- One phone, Android Chrome, 360 to 424 CSS px wide.
- Singapore time for every date and week boundary (`src/week.ts`, `src/util.ts`).
- Pure logic in its own module with unit tests. `npm test`, `npx tsc --noEmit` and `npm run build` stay green.
- Shafi tests every milestone on his phone before it ships; nothing is pushed to `main` without his go-ahead.
- No em or en dashes anywhere, in code, copy, Markdown output or this document.

## Vocabulary

- **Key**: what a lift is tracked by. Machines and cables by `equipmentId` (one machine at one outlet); free weights, kettlebells and bodyweight by `exerciseId`. Exactly `keyedByEquipment` in `src/history.ts`. The same machine at two outlets is two lifts.
- **Session**: the completed set rows for one key in one finished workout. Sessions are ordered by the workout's `startedAt`. An unfinished workout is never a session.
- **Working set**: a completed row with `isWarmup` false. Warm-ups never count anywhere in this document.
- **Working weight, W**: the heaviest weight that appears in at least two working sets of the session; if no weight repeats, the heaviest. Reps at W are the reps of the working sets at that weight. For `bodyweight_plus`, W is the added kg (0 when none).
- **Range**: the exercise's `repRange` `[lo, hi]`. `mid` is `ceil((lo + hi) / 2)`. For timed exercises the range is in seconds and "reps" below means seconds.
- **Step**: one increment of load for the lift. Machines and cables: the equipment's `stackStepKg` (what the step pill shows). Dumbbells, barbells, bodyweight-plus: the exercise's `defaultIncrementKg`. Kettlebells: the next size up or down in `bellSizes` (seed sizes plus any size ever ticked); at the end of the list there is no further step and the rule holds instead.
- **Reps-only lift**: an exercise whose step is 0 in the seed (the core moves such as Dead Bug, Bird-dog, Hanging Knee Raise and Plank, and the plyo moves other than Box Jump), or a `bodyweight_plus` exercise whose last session had W = 0. These have no load to move. Note that `weightStep` in `src/history.ts` substitutes 2.5 for a 0 step for the stepper's sake; the coach does not, it treats 0 as "no step". The plyo moves are in scope as reps-only lifts.
- **Effort**: the exercise's RPE for the session from `ratingOf` (6 to 10). Missing counts as 8: neither hard nor easy.

## Part 1: the nudge on the exercise card

### Where it sits

Directly under the "Last" line and above the first set row, inside the card. Full card width, 56 px tall, radius 14 px, its own background. It is one button (or one static line in the Hold state). Shafi picked this shape from a mockup on 1 Nov 2026 (`.superpowers/brainstorm/31888-1793496738/content/coach-home.html`, gitignored).

It appears when the exercise has at least one earlier session for its key. It is not shown on a first-ever session. It disappears once any row of that exercise in this workout is ticked (my call: once lifting starts the card should be the set rows and nothing else; the target he accepted is already in the rows).

### What it says

`suggestNext(input)` in a new pure module `src/coach.ts` returns one of these, in this order of precedence. `n` is the number of working sets last session, used for the ghost row count as today.

| State | Condition | Line | Tap |
|---|---|---|---|
| Light | A light week is running (Part 3) | "Light week · 90 × 10" (total loads) or "Light week · 16 ph × 10, two sets" (per-hand loads) | Sets ghost rows to the light target |
| Hold | Effort last session was 10 | "Hold · Last one was a 10. Repeat 100 × 12, 12, 10" | None; the ghost rows already match |
| Drop | Each of the last two sessions has a working set at W with reps under `lo` | "Two short · Try 97.5 × 10" (W minus one step, reps `lo`) | Sets ghost rows |
| Reset | The lift is stalled (Part 2) | "Stalled 3 sessions · Reset to 95 × 10" (W minus two steps, reps `lo`) | Sets ghost rows |
| Up | Every working set at W reached `hi` and effort was 9 or below; **or** every working set at W reached `mid` and effort was 7 or below | "Feeling good? 102.5 × 10" (W plus one step, reps `lo`) | Sets ghost rows |
| Reps | Otherwise | "Feeling good? 100 × 12" where the rep target is `max(min reps at W + 1, median reps at W)`, capped at `hi` | Sets ghost rows |

Examples at Leg Press, range 10 to 15, step 2.5:

- 100 × 12, 12, 10 at an 8: Reps, "100 × 12" (min + 1 is 11, median is 12).
- 100 × 12, 12, 12 at an 8: Reps, "100 × 13".
- 100 × 15, 15, 15 at a 9: Up, "102.5 × 10".
- 100 × 13, 13, 13 at a 7: Up (all at or past mid 13, felt easy), "102.5 × 10".
- 100 × 12, 11, 10 at a 10: Hold.
- 100 × 10, 9, 8, and the session before 100 × 10, 9, 9: Drop, "97.5 × 10".
- Three sessions at 100 × 12, 12, 10 with nothing moving: Reset, "95 × 10".

Light week arithmetic: for `total` and `bodyweight_plus` loads, the light weight is 90 percent of W rounded down to a multiple of the step (never below one step); reps `lo`; same set count. For `per_hand` loads and kettlebells, the weight stays at W and the set count is halved, rounding up, so three sets become two; reps `lo`. My call: a bell size down is too big a cut (16 to 12 kg is a quarter), so volume takes the cut instead.

Kettlebell steps: Up moves to the next bell size; Drop one size down; Reset two sizes down. When no larger size exists, Up becomes Reps with the line "Top of the range · Try a bigger bell" and no tap (my call).

Timed exercises (`loadMode: 'timed'`): the Reps rule runs on seconds with a step of 5 seconds in place of one rep, capped at `hi`. Up applies only if the exercise carries a load (a carry with a bell); a plank at the top of its range reads "Top of the range · Repeat 60s" with no tap. No e1RM for timed exercises; their PRs and stalls use seconds (Part 2).

Reps-only lifts: Up, Drop and Reset never fire, because there is no load to move. Reps and Hold apply as written. At the top of the range the line reads "Top of the range · Repeat 15, then add load" (or "Repeat 60s") with no tap. A stalled reps-only lift still shows on the coach card, and its nudge reads "Stalled 3 sessions · Repeat 15, then add load" with no tap (my call: the honest answer for a bodyweight move is a harder variation or added load, which is his choice, not a number the app can pick). Light week for reps-only lifts halves the set count like bells.

Box Jump (`height_cm`): no nudge, no estimate, no stall, no PR, no coach card row. Everything else in this document skips it.

### The tap

Tapping an offer rewrites every **ghost** row of that exercise in this workout: `weightKg` to the target load and `reps` (or `durationSec`) to the target count. Real rows (ticked or edited by hand) are never touched. The line turns solid accent and reads "Trying 102.5 × 10" with a ✓ glyph at the right; the rewritten ghost rows show their values in accent so he can see what changed. Tapping the solid line undoes: ghost rows return to the copy of last session (`prefillRows` output). Light-week halving removes the extra ghost rows and undo restores them.

Each row the tap writes gets `coach: 'up' | 'reps' | 'drop' | 'reset' | 'light'` (new optional field on `SetRow`, no index, no Dexie bump). Undo clears it. The field survives when the ghost row becomes real on ✓, so the weekly file can say which offers were taken. A row he edits by hand before ticking keeps the field (he may have adjusted one rep); a row he unticks keeps it too.

Per-hand and kettlebell lines use "ph" as `formatLast` does ("16 ph × 10"); machines and barbells show the bare number; the unit is never repeated since the "Last" line above already says kg.

### Colours

Offer states (Up, Reps): accent text on `--accent-soft`. Taken: `--accent` background, `--accent-text`. Hold: muted text on `--raised`, load and reps in text colour. Drop and Reset: warn text on `--warn-bg`. Light: accent text on `--accent-soft` with the kicker "Light week". The kicker is the first word group in the small uppercase style the dock uses; the target follows in 15 px / 700.

## Part 2: estimates, PRs, stalls

All pure functions in `src/coach.ts` over `GymData` (the same raw tables `loadAll` in `src/export.ts` gathers), with tests.

### Estimated one-rep max

Epley: `e1RM = w × (1 + reps / 30)`, over working sets with 1 to 15 reps, taking the highest value in the session; rounded to the nearest whole kg for display, unrounded for comparisons. The estimate is **rough** when the set it came from had more than 10 reps. PLAN.md limited Epley to 10 reps; Shafi's ranges run to 15 and Leg Press would almost never get a point, so my call is to extend to 15 and mark the rough ones (hollow dot in the sparkline, "~" in the weekly file, faint colour in the list). Sets over 15 reps and sessions with none between 1 and 15 produce no estimate.

Which exercises get an estimate: `loadMode` `total` and `per_hand` (per-hand lifts estimate per hand, consistently). `bodyweight_plus`, `timed` and `height_cm` get none: an estimate over added kg alone is meaningless and one over body weight would move with his weight loss. Those exercises (`bodyweight_plus` and `timed`, Box Jump excluded) still get stalls (on reps or seconds), the history sheet (list only) and PRs defined as a new best working set: for `bodyweight_plus`, more reps at the heaviest added load ever used, or a heavier added load; for `timed`, more seconds at the heaviest load (or more seconds, when unloaded). My call. The PR rule of "at least two earlier sessions" and the light-week exclusion apply to them too.

### PR

A session is a PR for its key when its estimate is higher than every earlier session's estimate for that key, and at least two earlier sessions exist (a first or second session is never a PR). Rough and solid estimates compare on equal terms (my call: nearly all of his sets are over ten reps, so demanding solid points would mean no PRs). Sessions inside a light week never count as PRs and are skipped as a comparison baseline too.

Where a PR shows: a "PR" tag on that exercise's line in the finish sheet the moment the workout ends; a row on the coach card for the rest of that calendar week; a tag in the history sheet; a bullet in the weekly file.

### Stall

A key is stalled when it has at least three sessions since its last reset or light week, and neither of the last two session-to-session transitions shows progress. Progress from session A to the next session B is any of:

- W rose;
- W equal and total working reps at W rose (seconds for timed);
- the estimate rose (when the exercise has one).

A session with `coach: 'reset'` rows, and any session inside a light week, restarts the count: the three sessions must all be after it. Drop sessions do not restart it (a drop is part of the stall picture, not a fresh start).

The stall clears as soon as a new session shows progress against the previous one, or as soon as a reset session is finished, or a light week starts. So the coach card's stall row disappears when the reset workout is finished, and the nudge the session after a reset is the ordinary Reps rule from the reset session (never a second Reset). If the lift stalls again, that takes three fresh sessions.

The coach card lists each stalled key whose latest session is within the last 28 days (older lifts are forgotten, not nagged about), one row each: "Leg Press · Tampines West" with "stalled: 3 sessions at 100 × 12" (the count of sessions in the stall, W, and the median reps at W of the latest session).

### Light week due

The coach card shows "Light week due" when no light week is running, no snooze is active, and any of these hold:

- two or more keys are stalled right now, counting only keys with a session in the last 28 days (PLAN.md's "2 stalls in a week", widened to the current picture since a stall is a state, not an event);
- any key's estimate fell more than 5 percent from one session to the next twice within its last four sessions;
- 42 days or more have passed since the last light week ended, or, if there has never been one, since the first finished strength workout, and at least 42 days of history exist.

Tapping it opens a short confirm sheet: "Start a light week? For the next seven days every lift's target drops ten percent (bells keep their size and lose a set). PRs and stalls are not judged during it." Buttons: **Start light week** (primary) and **Not now** (snoozes the row for seven days; the conditions are re-checked after). Shafi has never done one and said he believes he should, so the sheet explains it once in plain words.

## Part 3: light week

### State

A new Dexie table `coach` (schema version 3), key-value, primary key `key`:

- `lightWeeks`: a list of `{ startedAt, endsAt }` ISO strings in Singapore time, oldest first; the last entry is the running one when `endsAt` is in the future. `endsAt` is `startedAt` plus seven days at the same clock time. Ending early sets `endsAt` to now. The list is what `lastSession`, the stall count, PRs and the weekly file consult, and the 42-day clock reads the last `endsAt`.
- `lightWeekSnoozedUntil`: ISO string.

A workout is inside a light week when its `startedAt` falls in `[startedAt, endsAt)` of any entry.

### Behaviour

While running: every nudge is in the Light state (Part 1), the coach card's first row reads "Light week · 4 days left" (tap opens the same confirm sheet with **End light week early** and **Keep going**), PRs and stalls are not evaluated for sessions inside it, and the "Light week due" row is hidden. When it ends, every lift's history reading skips the light sessions: `lastSession` in `src/history.ts` (and so the "Last" line, the ghost rows and their count) and the nudge all use the last session **before** the light week, as long as one exists (my call: the light sessions are not evidence of anything, and the first session back should look exactly like the one before the light week, so Hold's "the ghost rows already match" and the tap's undo stay true). `lastSession` therefore needs the light week periods; keep them in the `coach` table as a list (see Part 3 State) and pass them in. The light sessions still appear in the history sheet list and the weekly file, tagged "light", and they still count toward the sessions table and volume. The 42-day clock restarts from `endsAt`.

## Part 4: the coach card on Home

Shafi picked the card over a one-line strip from a mockup on 1 Nov 2026 (option A).

### Placement and shape

A `.card` between the Cardio / Bodyweight two-up row and the "Past workouts" heading. Header row: kicker "Coach" in accent, and "this week" in faint at the right. Then rows, each 56 px tall, hairline between them, in this order:

1. Light week running (one row) or Light week due (one row).
2. Stalled keys, one row each, most recent session first.
3. PRs this calendar week, one row each, newest first: "Lat Pulldown" with "e1RM 78 kg, up from 75"; for exercises without an estimate, "best set 14 reps at BW+10".

Each row: a 34 px icon square at the left (PR: "PR" in accent on `--accent-soft`; stall: "!" in warn on `--warn-bg`; light week: "↓" in muted on `--raised`), a bold title line, a muted 13 px detail line, a chevron at the right. Rows for a key that is equipment-keyed carry the short outlet name in the title ("Leg Press · Tampines West").

When there are no rows, the card is not rendered at all. More than six rows: show six and a last muted row "and n more" that opens nothing (my call; expected to be rare).

### Taps

PR and stall rows open the history sheet (Part 5) for that key. Light week rows open the confirm sheet (Parts 2 and 3).

### Data

Home already loads workouts for its past list. The card needs the full `GymData` (as the export does) plus the `coach` table; compute once on Home mount and after a light week starts or ends. The computation is a few thousand rows at most; no caching needed.

## Part 5: the history sheet

Shafi picked "sparkline first" from a mockup on 1 Nov 2026 (option A, `.superpowers/brainstorm/31888-1793496738/content/history-sheet.html`).

### Opens from

- A PR or stall row on the coach card.
- The "Last" line on an exercise card in a workout (the line becomes a button; the card's thumbnail and name still open the technique sheet).

A bottom sheet (`BottomSheet`, Android back closes it), full height minus the usual top gap, scrolling inside.

### Content, top to bottom

1. Kicker: the key's place, "Tampines West machine" for equipment keys, nothing for the rest. Title: exercise name, 20 px / 800.
2. Three stats in a row (22 px / 800 numbers, 12 px muted captions): "e1RM now" (latest session's estimate), "best, 17 Oct" (highest ever, in accent, with its day), "+6 over 12 sessions" (latest minus the oldest shown, signed). For exercises without an estimate the three are "best set", "most reps" (or seconds) and "sessions" counts, builder's wording.
3. The sparkline: the last twelve sessions' estimates, oldest left, as an inline SVG 120 px tall with three faint gridlines. Solid dots for solid estimates, hollow for rough, the all-time best dot larger with a bright ring. No axis numbers; under it a 11 px faint line "12 Sep · twelve sessions · 31 Oct". Omitted entirely for exercises without an estimate. Under `prefers-reduced-motion` nothing differs, since nothing animates.
4. The sessions list, newest first, up to twelve: day label (72 px column, muted), load × reps with RPE and pain exactly as the weekly file's bullet formats them (`formatSession` plus `ratingOf`), the estimate at the right (muted, faint when rough, accent when it is the PR), and a small tag: "PR" (accent) or "stall 3" (warn, on the latest session only, with the stall's session count).
5. A faint note: "Estimate is Epley from the best working set. Faint means over ten reps, so rough. Warm-ups never count."

Tag text is at least 11 px (the mockup used 10 px; the build uses 11).

## Part 6: finish sheet

The per-exercise line gains a "PR" tag (same style as the coach card icon, 20 px tall) when that session is a PR by Part 2's definition against all earlier sessions. Computed when the sheet opens; nothing stored. No other change.

## Part 7: the weekly Markdown file

Changes to `weeklySummary` in `src/weekly.ts`, keeping every Phase 2 section and its order. Shafi chose to add these on 1 Nov 2026.

- **Strength bullets** gain the estimate: `- Sat 31 Oct · 100 × 12, 12, 10 · RPE 8 · e1RM ~128`. The "~" marks a rough estimate; a solid one reads `e1RM 131`. Exercises without an estimate have no segment.
- **Coach section**, `## Coach`, placed after Sessions and before Strength, omitted when empty. Bullets in this order:
  - `- PR: Lat Pulldown (Orchard Gateway machine) · e1RM 78, up from 75 · Tue 27 Oct`
  - `- Stalled: Leg Press (Tampines West machine) · 3 sessions at 100 × 12`
  - `- Reset taken: Leg Press (Tampines West machine) · to 95 · Sat 31 Oct` (from `coach: 'reset'` rows ticked this week); likewise `- Drop taken: ...`
  - `- Light week: Mon 26 Oct to Sun 1 Nov` when any day of the week was inside one, with "(running)" if it has not ended.
- **Muscle line** gains hard sets in brackets: `Legs 9 (hard 6) · Glutes 6 (hard 4) · ... · Core 0 (hard 0)`. A hard set is a working set from an exercise whose session effort was 8 or above (unrated sessions are not hard). This is PLAN.md's "weekly hard sets per muscle group".
- Header line 2 gains: `e1RM is Epley from the best working set; "~" means over ten reps.`

The file stays facts plus the app's own flags. Still no averages, and no suggested weights for next week (the nudge does that live).

## Data changes

- `SetRow.coach?: 'up' | 'reps' | 'drop' | 'reset' | 'light'`: no index.
- New table `coach` (key-value), Dexie version 3. Existing tables unchanged. No data migration.
- Export JSON: set objects gain `coach` when present; `schema` stays `gymlog/1`. The `coach` table is exported as a top-level `coach` object (the two keys) so a restore could keep the light week clock; readers that ignore it lose nothing.
- No seed changes. Rep ranges and increments are already in `seed.json`.

## Module plan (for the builder)

- `src/coach.ts`: `workingWeight`, `e1rm`, `sessionsFor(key)`, `suggestNext`, `isStalled`, `prs`, `lightWeekDue`, `coachRows`, `inLightWeek`. Pure, typed over `GymData` plus the `coach` table rows, with tests in `src/coach.test.ts` covering every row of the state table above, the kettlebell, timed and reps-only branches, light-week arithmetic, the stall restart rules (reset clears, drop does not), PR with rough points, PR for bodyweight and timed lifts, and the three deload triggers.
- `src/history.ts`: `lastSession` gains a light-week filter (skip sessions inside a light week when an earlier one exists); `history.test.ts` covers it.
- `src/weekly.ts` grows the Coach section, the estimate segment and hard sets; `src/weekly.test.ts` grows with it.
- UI: `NudgeLine` in `src/screens/Workout.tsx` (or its own file), `CoachCard` on Home, `HistorySheet` and `LightWeekSheet` in `src/screens/`. The finish sheet gains the tag.

## Acceptance checks (phone, before Shafi's sign-off)

Airplane mode throughout, installed PWA, against the dev server first and the deployed site after the push.

1. Add an exercise with history. The nudge line shows under "Last" with a target that matches the rule for that history. Tap it: the ghost rows change to the target in accent and the line reads "Trying ...". Tap again: the rows return to last session's values. Tick set 1: the line is gone.
2. An exercise whose last session was rated 10 shows the grey Hold line with no tap.
3. Log the same Leg Press session three times (dev data is fine). Home shows the coach card with "Leg Press · Tampines West, stalled: 3 sessions at ...". Add Leg Press to a workout: the nudge reads "Stalled 3 sessions · Reset to ..." two steps down. Take it, finish: the stall row is gone from Home, and the next time Leg Press is added the nudge is an ordinary "Feeling good? ..." from the reset session, not another Reset.
4. Tap the stall row: the history sheet opens with the three stats, the sparkline (hollow dots for over-ten-rep sets), and the sessions list with the "stall 3" tag. Back closes it. The same sheet opens from the "Last" line on a card.
5. Beat the best estimate on a lift with at least two prior sessions: the finish sheet line shows "PR", Home shows a PR row, the history sheet marks the dot and the row.
6. With no light week ever and at least 42 days of history (dev data), Home shows "Light week due". Tap, "Not now": the row disappears; "Start light week": every nudge reads "Light week · ..." at 90 percent (or two sets for bells), the coach row says "Light week · 7 days left", and no PR or stall is reported for workouts inside it.
7. Weekly summary for a week with a PR, a stall and a reset taken: the Coach section lists them, strength bullets end in "e1RM ~n" or "e1RM n", the muscle line shows "(hard n)" per chip.
8. `npm test` green with `coach.test.ts` and the grown `weekly.test.ts`; `tsc` clean; `npm run build` clean.

## Left to the builder

- Whether `NudgeLine` lives inside `Workout.tsx` or its own file; how the accent highlight on rewritten ghost rows is styled.
- Sparkline scaling (fixed padding above and below the min and max) and whether it uses `viewBox` scaling or measured width.
- Exact wording of the three stats for exercises without an estimate.
- How the coach card computes on Home without delaying the first paint (compute after the past list renders is fine).
- Test fixtures; a sample `GymData` with twelve sessions of one lift is encouraged and can be shared with the weekly tests.

## Decisions recorded

- The nudge is a conditional offer in his words ("If you're feeling good today, consider pushing yourself"): Shafi, 1 Nov 2026.
- The offer is a tap that sets the ghost rows, not text alone: Shafi, 1 Nov 2026.
- Reps first then weight, with an early step up when a session felt easy (the mix): Shafi asked for a mix of the two textbook orders and for rep guidance alongside weight, 1 Nov 2026. Thresholds (hi at RPE 9 or below; mid at RPE 7 or below) are Claude's call.
- Straight sets as the assumption, pyramids left to warm-ups: Claude's recommendation, Shafi accepted, 1 Nov 2026.
- Missed reps are edited down on the row and become the record: Shafi asked, 1 Nov 2026.
- Coaching before the workout lives on Home: Shafi wanted to reflect before starting and asked for a recommendation; coach card over a one-line strip (option A) from a mockup, 1 Nov 2026.
- A light week is one tap to start and runs itself for seven days at 90 percent: Claude's recommendation, Shafi said he has never done one and believes he should, 1 Nov 2026. Bells keep their size and lose a set: Claude's call.
- Stall acts on the card (Reset state) and informs on Home: Claude's call, Shafi accepted, 1 Nov 2026.
- Epley extended to 15 reps with rough marking: Claude's call, Shafi accepted, 1 Nov 2026.
- History sheet with the sparkline first (option A) from a mockup: Shafi, 1 Nov 2026.
- Weekly file gains estimates, a Coach section and hard sets: Shafi, 1 Nov 2026.
- Nudge hidden after the first tick; Hold has no tap; Reps offer target is max(min + 1, median) capped at hi; missing effort counts as 8; no estimate for bodyweight, timed and box-height exercises; stalled lifts older than 28 days are forgotten; "Not now" snoozes seven days; `coach` tag on rows and a key-value `coach` table: Claude's calls.
- After the builder check (1 Nov 2026), Claude's calls: a finished reset session clears the stall and the next nudge is the ordinary rule; reps-only lifts (step 0, or bodyweight with no added load, plyo included) get Reps and Hold only, with text-only lines at the top of the range and when stalled; after a light week the "Last" line, ghost rows and nudge all read the last session before it; bodyweight-plus and timed lifts get PRs on best working set, Box Jump gets nothing.
