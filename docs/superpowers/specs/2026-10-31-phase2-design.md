# Phase 2: rest timer, effort and pain on the set, weekly summary

Date: 2026-10-31. Status: draft for Shafi's approval. Nothing here is built yet. Builds on PLAN.md and the two Phase 1 specs in this folder; where this document is silent, those apply.

## Intent

Phase 1 passed its airplane-mode test on 31 Oct 2026 and is live. Shafi now wants the app to carry him between sets, and he wants the data to flow back to the claude.ai Project that tracks his health and fitness so it can help him plan past a plateau.

Brainstormed with Shafi on 31 Oct 2026. The moment that shaped it: after he ticks a set he locks the phone and walks around, checking his watch or the timer before the next set. So the timer's job is to be right the instant he unlocks, not to call him back.

Phase 2 is three pieces, in this order: the rest timer in the dock, an effort rating and a pain flag at the end of each exercise, and a weekly Markdown summary he shares to the Project by hand. Supersets, timed circuits and cloud sync are not in this phase (see Non-goals).

## Goals

- On unlock, the dock shows how long he has rested since the last tick, with no setup and no extra tap, and it is always correct.
- The end of an exercise takes one optional tap to record how hard it was, and one more to flag a back or knee twinge.
- Next session's "Last" line shows that effort and that flag.
- One tap on Home produces a Markdown file for the week that the Project can read: sessions, every lift with three sessions of history, muscle coverage, cardio, bodyweight, notes. No verdicts; the Project does that reading.

## Non-goals

- Sound, vibration, notifications or a wake lock for the rest timer. Chrome on Android cannot reliably do any of them from a locked screen, and Shafi said a correct countdown on unlock is enough.
- A rest length setting, per-exercise rest lengths, or a way to pick a length mid-workout. The two lengths are constants.
- Supersets and timed kettlebell circuits. Shafi does not do them in a normal week. They stay on PLAN.md's Phase 2 list for a later phase; this document does not amend PLAN.md.
- Cloud sync (PLAN.md Phase 4). Shafi asked whether the Project could read a database directly; the answer is Phase 4's Apps Script and Sheet, and he chose to keep the Markdown file first (option A on 31 Oct 2026).
- Coaching: suggested weights, plateau or stall labels, e1RM. Phase 3.
- Any change to the export JSON shape beyond the two optional fields under Data changes.
- Anything on PLAN.md's Do-not-build list.

## Anti-goals

- A set row or the ✓ in the dock that needs a second tap. The rest display must never sit between the thumb and the ✓.
- A timer that drifts or resets when the tab is backgrounded, the screen locks, or the app is reopened. It must be derived from stored timestamps, never from a running counter.
- A dock so tall in its chip state that the current exercise card cannot be scrolled fully into view above it.
- A summary file that mixes the same machine at two outlets, or that invents numbers (no estimated 1RM, no averages across sessions).
- Network use. Everything here works in airplane mode.

## Constraints

- Stack and rules from PLAN.md: Vite, React, TypeScript, Dexie, plain CSS, no component library, 56 px tap targets, one dark theme. Design tokens, type scale and motion from the Phase 1 redesign spec.
- One phone, Android Chrome, 360 to 424 CSS px wide.
- Singapore time for every date and week boundary (+08:00, no daylight saving; `sgIso` and `sgDate` in `src/util.ts`).
- Pure logic goes in its own module with unit tests, like `nextSet.ts` and `history.ts`. `npm test` and `tsc` stay green.
- Shafi tests every milestone on his phone before it ships; nothing is pushed to `main` without his go-ahead.

## Part 1: the rest timer

### What drives it

Nothing new is stored. Every tick already writes `completedAt` on the set row. The timer is a pure function of the workout's set rows and the current time, recomputed every second by the existing one-second `now` state in `Workout.tsx`.

Definitions, for a module `src/rest.ts` with tests:

- **Last tick**: the completed row in this workout with the greatest `completedAt`. No completed row, no timer.
- **Target**: 120 seconds if, at the time of rendering, the last tick's exercise has no unticked rows (real or ghost) left; otherwise 60 seconds. This means the drink-up target applies after the last set of an exercise, and drops back to 60 if Shafi adds another set to that exercise during the rest.
- **Elapsed**: now minus the last tick.
- **Remaining**: target minus elapsed. Negative means over.
- **Showing**: the rest display is shown while elapsed is under target plus 5 minutes. After that the dock returns to its plain Up next or Finish state. This also covers reopening an unfinished workout hours later: no stale countdown.
- Unticking the last-ticked set makes the previous tick the last tick, or hides the timer if none remains.
- A new tick simply restarts everything, including ticking the next set early.

Seconds are whole numbers, floor of the millisecond difference. Display is `m:ss`; over time is `+m:ss`.

### The dock while resting

Shafi picked this layout from two mockups on 31 Oct 2026 (option A, "rest takes over the dock"; mockups in `.superpowers/brainstorm/`, gitignored). Three states.

**Resting, next set exists.** The dock keeps its shape: body on the left, 64 px ✓ on the right.

- Kicker line: "Rest" in accent while remaining is positive; "Rest · over" in warn once it is not.
- Where the exercise name sat: the time at 34 px / 800, tabular numerals, accent-coloured when positive, warn and prefixed "+" when over.
- Meta line: "Next · Leg Press set 2 · **100 kg** × 12", the load in text colour, the rest muted. For a warm-up row: "Next · Leg Press warm-up · 60 kg × 12".
- The ✓ is unchanged in size, position and behaviour. Around it a 3 px ring drains clockwise from full at tick to empty at target (CSS `conic-gradient` on a pseudo-element, updated with the one-second state); once over, the ring is full again in warn. Under `prefers-reduced-motion` the ring is static (full in accent, then full in warn) and only the numerals change.
- Tapping the body still scrolls to the next set's card.

**Drink-up (target 120) and no next set.** The exercise just finished was the last one with open rows.

- Kicker "Rest · drink up" (accent), or "Rest · over" (warn).
- Time as above.
- Meta line: "Then add the next exercise".
- Right side: a primary button "+ Exercise", 56 px tall, which opens the picker exactly as the page's "+ Add exercise" does. Picking an exercise adds it. Nothing restarts, because no new tick happened: the count keeps running toward the same 120-second target, and the dock becomes the next state below, with the ✓ on the new exercise's first row and the chip row still there for the exercise just finished.
- Below, the chip row from Part 2.
- Finish is not in the dock in this state. It stays at the bottom of the page, and the dock returns to today's "All sets ticked / Finish" state when the rest display stops showing (target plus 5 minutes). My call: during the window, adding an exercise is what Shafi reaches for; Finish is one scroll away.

**Drink-up and a next set exists.** Reached by adding an exercise during the drink-up, or when Shafi added two exercises ahead. The dock looks like the resting state (time, next set, ✓) with the kicker "Rest · drink up", and the Part 2 chip row below it for the exercise of the last tick. The ✓ keeps working; ticking it is a new tick and restarts the count at 60.

The target rule is the one under Definitions and nothing else: 120 while the last tick's exercise has no open rows, whatever else is in the workout. Settled after the builder check (my call), because it is the only reading that keeps the timer a pure function of stored timestamps.

**No rest display** (no tick yet, or window over): the dock is exactly today's.

### Page bottom padding

The page already pads its bottom for the dock. The chip row makes the dock taller; the padding must follow the dock's measured height (a `ResizeObserver` on the dock, or a fixed value per state, builder's choice) so the last card and the Finish button can always be scrolled into view.

## Part 2: effort and pain at the end of an exercise

Shafi chose effort out of 10 over reps in reserve (31 Oct 2026), matching the cardio RPE chips.

### The chip row

Shown in the dock only while the drink-up rest display is showing (target 120, within the window), for the exercise of the last tick. One horizontally scrollable row, 56 px tall, scrollbar hidden, existing `.chip` style:

- Five effort chips: 6, 7, 8, 9, 10. One selected at most. Tapping the selected one clears it.
- A thin vertical hairline.
- Two warn-styled chips: "Back", "Knee". One selected at most (see Storage). Shown for every exercise, not only the ones carrying a caution flag (my call: a twinge is not limited to the exercises the seed expects).

On a 412 px screen the whole row fits without scrolling; on 360 px the Knee chip may sit just off the edge and the row scrolls. Acceptable: pain is rare, effort is the common tap.

### Storage

- `SetRow` gains `rpe?: number` (6 to 10). `painFlag` already exists as a single value `'back' | 'knee'` and stays so. The Back and Knee chips are therefore a radio: tapping Back writes `painFlag: 'back'`, tapping Knee writes `'knee'`, tapping the selected one clears it (my call, from the schema PLAN.md defined).
- Both fields are written to the exercise's last completed working set in this workout (the last tick). If a later tick on the same exercise happens (he adds a set after rating), the rating stays on the earlier row and the chips show no selection for the new last tick; he can rate again. Readers take the latest rated row per exercise per workout.
- No Dexie schema bump: neither field is indexed. A comment in `db.ts` records the addition.

### Where it shows up

- **"Last" line** on the card (`formatLast` in `history.ts`): the existing text, then " · 8/10" if the latest rated row of that session has `rpe`, then " · back" or " · knee" in warn colour if it has `painFlag`. Example: `Last 100 kg × 12, 12, 10 · 8/10 · back`. The folded card and the finish sheet lines use the same formatter and inherit this.
- **Finish sheet**: the per-exercise lines inherit the suffix. Nothing else changes.
- **Up next dock** meta line: never shows the suffix (it formats a single future row).
- **Export JSON**: a set gains `rpe` and `pain` keys only when present. Shape otherwise frozen.
- **Weekly summary**: Part 3.

## Part 3: weekly summary

### Entry point

Home gains a secondary button "Weekly summary" beside "Export JSON" (two-up row, same style). It opens a bottom sheet, modelled on the export sheet:

- A two-way segmented control: "This week" (selected) and "Last week".
- File name and size, e.g. `gymlog-week-2026-W44.md · 3.1 KB`.
- "Share or download" and "Copy". Share uses the Web Share API with a `text/markdown` File when `canShare` allows it, else a download, as `shareOrDownload` does today. Copy writes the Markdown text; if blocked (plain http), the textarea fallback from the export sheet appears.
- The builder may generalise `ExportSheet` into a shared sheet that takes a file builder, or write a sibling `WeeklySheet`. Either is fine.

### Week

Calendar week, Monday 00:00 to Sunday 23:59:59 Singapore time. Week number is ISO (W01 to W53). "This week" is the week containing today; "Last week" the one before. A workout belongs to the week of its `startedAt`; a bodyweight entry to the week of its `date`.

### Content

A pure function `weeklySummary(input, weekStart): string` in `src/weekly.ts`, with tests, where `input` is the same data `buildExport` gathers (outlets, exercises, equipment, workouts, sets, cardio sessions, bodyweight). The module does no database access. Output, in this order; a section with nothing in it is omitted, except Sessions, which then reads "No sessions this week."

**Header**

```
# Gym Log · week 44 · Mon 27 Oct to Sun 2 Nov 2026
Generated Sun 2 Nov 2026 21:10 (+08:00). Weights in kg. "ph" = per hand. Effort is RPE out of 10.
```

**Sessions**: a table with Date, Outlet, Type, Duration, Sets, Volume. Strength rows: duration from `startedAt` to `endedAt`, sets = completed rows (warm-ups included), volume from `volumeKg` in `summary.ts`, formatted with a thousands separator and " kg". Cardio rows: Type "Cardio", Sets column shows the modality short name ("4x4", "Zone 2", "Bike"), Volume column shows "avg 148 · max 171" from whatever heart rates exist, blank if none. Unfinished strength workouts (no `endedAt`) are excluded. Outlet uses `shortOutlet`.

**Strength, by exercise**: one `###` heading per exercise with at least one completed working set this week, in order of first appearance in the week. For exercises keyed by equipment, the heading carries the machine in muted parentheses: `### Leg Press (Tampines West machine)`; one heading per equipment row, so the same machine at two outlets becomes two headings. Under each heading, one bullet per session: this week's sessions first, newest first, in bold; then the three most recent sessions before the week start for the same key (equipment id, or exercise id for free weights, kettlebells and bodyweight), not bold. Bullet format:

```
- Fri 31 Oct · 100 × 12, 12, 10 · RPE 8 · back
```

Load formatting for the summary (a helper next to `formatLast`, shared if practical): total load "100"; per hand "14 ph"; bodyweight-plus "BW" or "BW+10"; box height "60 cm"; timed sets show seconds in place of reps, "45s"; warm-ups are left out; if weights differ within a session, "100×12, 105×10" as `formatLast` does. "RPE n" and the pain word appear only when present on the session's latest rated row. Kilogram units are stated once in the header, not per line (my call, to keep lines short for the Project).

**Working sets per muscle this week**: one line, all eight picker chips, count of completed working sets whose exercise maps to that chip via `chipsFor` in `muscles.ts` (an exercise under two chips counts under both), sorted by count descending then chip order, zeros included: `Legs 9 · Glutes 6 · Chest 6 · Back 5 · Shoulders 3 · Biceps 3 · Triceps 3 · Core 0`.

**Cardio**: one bullet per session this week, oldest first:

```
- Wed 29 Oct · Treadmill 4x4 · 38 min · 6.2 km/h at 10% · peaks 165, 168, 170, 171 · avg 148 · max 171 · RPE 8
```

Modality names from the seed's `cardioModalities`. Segments are omitted when their value is missing. 4x4 shows each interval's peak HR in order; speed and incline show the shared values, with an interval override noted inline as "(int 3: 6.5 km/h)".

**Bodyweight**: one bullet per entry this week, oldest first: `- Mon 27 Oct · 109.4 kg · waist 108 cm`. Then, if an entry exists within three days of 28 days before this week's latest entry: `- Four weeks ago (Mon 29 Sep): 110.6 kg. Change: −1.2 kg`. Otherwise no comparison line.

**Notes**: one bullet per strength or cardio session this week that has a note: `- Fri 31 Oct: "Swing felt it in the lower back on set 3"`.

Nothing else: no verdicts, no plateau labels, no suggested weights, no e1RM.

### File

`gymlog-week-<ISO year>-W<week>.md`, for example `gymlog-week-2026-W44.md`. Plain UTF-8 Markdown. The minus sign in the bodyweight change is the Unicode minus (U+2212) or a plain hyphen, builder's choice; never an en dash.

## Data changes

- `SetRow.rpe?: number` added to the type. No index, no Dexie version bump.
- Export JSON: set objects gain `rpe` and `pain` when present. `schema` stays `gymlog/1`.
- No seed changes.

## Acceptance checks (phone, before Shafi's sign-off)

Airplane mode throughout, installed PWA.

1. Start a workout, add Leg Press with at least two rows (prefilled from history, or tap "+ Set" once), tick set 1. The dock shows "Rest" and a count from 1:00 with the ring draining; the ✓ is where it was. Lock the phone for about 30 seconds, unlock: the count is about 0:30, not 1:00.
2. Wait past 1:00: the dock reads "Rest · over", "+0:05" in warn, the ring full in warn. Tick set 2 from the dock: one tap, the count restarts at 1:00.
3. Tick the last set of Leg Press. The dock reads "Rest · drink up" counting from 2:00, the button is "+ Exercise", and the chip row shows 6 to 10, Back, Knee. Tap 8, tap Back. Tap "+ Exercise", add Chest Press: the count does not restart, the dock now shows Chest Press set 1 with the ✓, and the chip row is still there with 8 and Back selected. Tick Chest Press set 1 from the dock: the count restarts at 1:00 and the chips are gone.
4. Finish. On the finish sheet the Leg Press line ends "· 8/10 · back". Start a new workout, add Leg Press: the Last line ends "· 8/10 · back" in the right colours.
5. Unfinished workout reopened the next day shows no countdown.
6. Home, "Weekly summary", "This week": the sheet shows the file name with the right ISO week. Share opens the Android share sheet with a `.md` file (over https). Copy gives the Markdown text. The text contains the sessions table, the Leg Press heading with this week's session in bold and earlier sessions after it, the muscle line, and the finish note if one was written.
7. "Last week" produces the previous week's file; a week with no data produces a file whose Sessions section reads "No sessions this week."
8. `npm test` green with tests for `rest.ts` (target choice, over, window, untick) and `weekly.ts` (week boundaries at Sunday midnight Singapore time, equipment keying, the three-session history, muscle counts, missing fields). `tsc` clean.

## Left to the builder

- Exact ring implementation and easing; whether the dock's taller state animates its height.
- Whether the chip row and the "+ Exercise" button share one dock component with today's states or split into a second component.
- How Home's two-up row wraps at 360 px.
- Test fixtures for the weekly summary; a snapshot of a full sample week is encouraged.
- Thousands separator style in the sessions table (comma or thin space).

## Decisions recorded

- Correct countdown on unlock, no alarm: Shafi, 31 Oct 2026.
- 60 seconds after a set, 120 after the last set of an exercise, counting past zero: Shafi, 31 Oct 2026.
- Rest takes over the dock (option A): Shafi, 31 Oct 2026, from mockups.
- Effort out of 10 rather than reps in reserve: Shafi, 31 Oct 2026.
- Pain marked on the set: Shafi, 31 Oct 2026. Radio between Back and Knee: Claude's call, from the existing single-value schema field.
- Supersets and circuits out of this phase: Shafi, 31 Oct 2026 ("I don't usually do that").
- Weekly Markdown file by hand now, Sheet sync in Phase 4 (option A): Shafi, 31 Oct 2026.
- No wake lock: Claude's call, since the phone is locked during rest anyway.
- Rest display window of target plus 5 minutes: Claude's call.
- "+ Exercise" replaces Finish in the dock during the drink-up window only: Claude's call.
- Adding an exercise during the drink-up does not restart the count: Claude's call after the builder check, 31 Oct 2026.
- Muscle set counts in the summary: Claude's call; PLAN.md lists "weekly hard sets per muscle group" under Phase 3, but a plain count over the existing chip mapping is cheap and helps the Project see what was skipped. Nothing about "hard" sets is computed.
