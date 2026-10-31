# Phase 1 redesign: Fitness dark, six fixes, technique sheet

Date: 2026-10-31. Status: draft for Shafi's approval. Nothing here is built yet.

## Intent

Phase 1 of Gym Log works but does not yet pass Shafi's own click-through. The look is generic, a new workout page opens pre-filled with last session's rows, the Leg Press stepper jumps in 10 kg, kettlebells cannot take odd sizes, Finish is in the header where a thumb can hit it, the 4x4 form is twelve steppers tall, and export dead-ends over plain HTTP. He also wants to see how to do each exercise correctly.

This spec restyles the whole app in one direction ("Fitness dark"), fixes those six things, and adds a technique sheet per exercise with a looping anatomy-style animation and written cues. It stays inside Phase 1: offline-first PWA, no backend, no Phase 2 features. PLAN.md remains the source of truth for everything this document does not change; its Do-not-build list has been amended to allow exercise technique visuals.

## Goals

- Logging a set is still one tap most of the time. Nothing here may add a tap to the happy path.
- The app feels like one designed product: one palette, one typeface, consistent corner radii, motion that confirms actions.
- A fresh workout reads as a clean page, while last session's numbers stay one tap away.
- Finish cannot be hit by accident and shows what is about to be saved and discarded.
- 4x4 cardio asks only for what changes per interval.
- Export never dead-ends; there is always a way to get the JSON out.
- Every seed exercise that has a match in the free ExerciseDB tier shows a looping animation and three to five short cues, fully offline.

## Non-goals

- Anything in PLAN.md Phase 2 or later: rest timer, RIR chips, pain flags, supersets, circuits, weekly summary, coaching rules, sync.
- A light theme. One dark theme only.
- A paid asset pack. Prototype assets come from the free tier; a licensed pack is a later decision after Shafi has used the sheet at the gym.
- Changing the data model beyond what is listed under "Data changes".
- Changing the export JSON shape. Phase 4 and the claude.ai Project depend on it.

## Anti-goals (would make this a failure even if it works)

- A set row that needs two taps where it needed one before.
- Any control under 56 px in its tap dimension. Steppers must be usable with a sweaty thumb.
- Assets or fonts loaded from the network at runtime. Airplane mode is the acceptance test.
- A bundle so heavy that first load on gym Wi-Fi fails. Keep added assets under 5 MB total.
- Finish sheet or technique sheet trapping the Android back button.

## Constraints

- Stack is fixed by PLAN.md: Vite, React, TypeScript, Dexie, vite-plugin-pwa, plain CSS. No component library, no animation library. CSS transitions and the Web Animations API only.
- One phone: OnePlus 15, Android Chrome, roughly 412 to 424 CSS px wide in portrait. Layout must also survive 360 px.
- Deploy target unchanged: GitHub Pages at `/gym-log/`. The existing workflow stays untouched until Shafi says the test passed.

## Design system: Fitness dark

Shafi picked this from three mocked directions on 2026-10-31. Mockups are in `.superpowers/brainstorm/mockups/` (gitignored, kept for reference).

### Colour

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0b0b0d` | page |
| `--card` | `#141418` | exercise cards, sheets |
| `--raised` | `#1c1c21` | steppers, chips, secondary buttons |
| `--line` | `#1f1f25` | hairlines inside cards |
| `--text` | `#f4f4f6` | primary text |
| `--muted` | see note | labels, "Last" line, inherited values |
| `--accent` | `#30d158` | done state, primary buttons, progress |
| `--accent-soft` | `#15201a` | done row background |
| `--accent-text` | `#04230d` | text on accent |
| `--warn` | `#ffb340` on `#2a2416` | warm-up badge, caution pills, discard warning |
| `--danger` | `#ff6961` | destructive text only |

Note on muted text: the mockups used `#9a9aa2`, which the design linter flagged. Builder picks the lightest grey that reaches 4.5:1 against both `--card` and `--raised` (around `#a7a7af`) and uses it everywhere muted text appears. Ghost rows are the one sanctioned exception: they are deliberately faint (see Workout screen).

### Type

- Typeface: Manrope, weights 500, 600, 700, 800. Self-hosted as woff2 in `public/fonts/`, declared with `@font-face` and `font-display: swap`, latin subset only. Fallback stack `system-ui, -apple-system, Roboto, sans-serif`. Manrope is SIL Open Font License; include the licence file next to the fonts.
- Scale: elapsed timer 34 px / 800; stepper numerals 22 px / 800, tabular; exercise name 19 px / 800; sheet title 22 px / 800; body 15 px / 500; section labels 11.5 px / 700, uppercase, letter-spacing 0.08em.
- All numerals use `font-variant-numeric: tabular-nums`.

### Shape and spacing

- Radii: cards 20 px, controls and chips 12 px, buttons 18 px, bottom sheets 28 px on the top corners.
- Page gutter 16 px. Card padding 14 px. Hairlines between set rows, not boxes.
- Minimum tap target 56 px in the direction the thumb approaches. Stepper + and − are 56 px tall; width may drop to 48 px where space demands it.

### Motion

- Tap ✓: check button scales 1 → 0.9 → 1 over 160 ms, row background cross-fades to `--accent-soft`, numerals tint toward accent. Vibration 40 ms stays.
- Ghost row becoming real: opacity 0.45 → 1 over 160 ms.
- Bottom sheets (finish, technique, custom machine, export) slide up 240 ms ease-out with a 55% black scrim fading in.
- Picker overlay slides up the same way.
- Progress strip width animates 240 ms.
- Respect `prefers-reduced-motion: reduce` by disabling all transforms and fades.

## Screens

### Home

Same functions as today, restyled.

- "Gym Log" title replaced by a greeting-free header: today's date (e.g. "Sat 31 Oct") in the section-label style, then the outlet chooser.
- Outlet chooser: wrapping chip row of the five outlets using short names (without "AF "), last used preselected. Replaces the `<select>`. Disabled while a workout is active.
- Start workout: full-width primary button, 72 px tall. Reads "Resume workout" when one is active.
- Cardio and Bodyweight: two secondary buttons side by side.
- Past workouts: cards, newest first, up to 30. Each shows date, outlet or cardio type, exercise count or modality, and duration. Tapping does nothing in Phase 1.
- Export JSON: secondary button at the bottom. Opens the export sheet (below).

### Workout

The only screen that matters. Layout from top to bottom:

**Header (sticky).** Left: outlet short name as a section label above the elapsed timer at 34 px. Right: a pill reading "5 of 12 sets". Below the header a 6 px progress strip, filled proportionally. No Finish button here.

- "Sets" counts every set row in the workout, ghost or real, warm-up included. "Done" counts rows with `completedAt`. With no exercises yet the pill reads "0 sets" and the strip is empty.

**Exercise cards**, in the order added. Each card:

- Top row: 64 px thumbnail (the exercise's technique visual, or a placeholder tile showing the exercise's first letter when no visual exists), exercise name, and on the right a step pill for equipment-keyed exercises (machines and cables) reading e.g. "step 2.5". Tapping the thumbnail or name opens the technique sheet. Tapping the step pill opens an inline chip row 1.25 / 2.5 / 5 / 10 / custom; choosing one writes `stackStepKg` on that equipment row and closes the chips. Free-weight, kettlebell and bodyweight exercises show no step pill.
- "Last" line beneath the name, unchanged in content: `Last 100 kg × 12, 12, 10`, with the load in `--text` and the rest in muted.
- Exercise note in warn colour when the seed has one.
- Set rows, then a two-button row: "− Set" and "+ Set".

**Set row.** Two lines tall, because real 56 px controls do not fit on one line at 360 to 424 px. The mockups compressed this; the build must not.

- Left column: badge, 56 px wide, full height of the row. Shows the working-set number, or "W" in warn colour for warm-ups. Tap toggles warm-up.
- Middle column, top line: weight control. Bottom line: reps stepper, or seconds stepper for timed exercises. Each 56 px tall.
- Right column: ✓ button, 56 px wide, full height. Tap toggles done, vibrates on completion.
- Weight control by exercise type, unchanged in behaviour from today: stepper for machines, cables, dumbbells and barbells; bell chips for kettlebells; "+ kg" stepper for bodyweight-plus; nothing for plank-style timed bodyweight moves.
- Done rows: background `--accent-soft`, ✓ filled accent, controls still editable.

**Ghost rows.** This replaces the prefill rule's visible effect without losing one-tap logging.

- When an exercise is added and history exists, the rows copied from last session are created as ghost rows: stored in the database like any set row, with `ghost: true`.
- A ghost row renders at 45% opacity with dashed outlines on its controls. It shows last session's weight and reps.
- Tapping ✓ on a ghost row sets `ghost: false` and `completedAt` in one write. One tap, as before.
- Changing any value on a ghost row, including toggling its warm-up badge, sets `ghost: false` without completing it.
- "+ Set" duplicates the last real row if any exists, otherwise the last ghost row; the new row is always real.
- "− Set" removes the last row whether ghost or real, but refuses if it is completed.
- Finish deletes every ghost row along with unticked real rows. Export already ignores rows without `completedAt`, so nothing changes there.
- If no history exists, one real empty row is created exactly as today.
- Ghost rows count toward the header's "of N sets" total.

**Kettlebell chips.** Chip row is horizontally scrollable, 56 px tall chips. Chips are the union of the seed bell sizes and every distinct `weightKg` ever completed on that exercise, ascending. A trailing "…" chip opens a numeric input (inputmode decimal, 56 px tall, autofocus); committing on Enter or blur selects that weight. Because selection writes `weightKg`, an odd size becomes a chip automatically next time once a set is completed with it.

**Below the cards.** In order: "+ Add exercise" (60 px, raised), the workout note field, then "Finish workout" as a quiet outlined button, 56 px, with 24 px space above it. Finish opens the finish sheet.

**Finish sheet.** Bottom sheet over the workout.

- Title "Finish workout?"
- Three stat tiles: duration (mm:ss), sets done, volume in kg. Volume = Σ weightKg × reps over completed non-warm-up rows that have both values; `per_hand` exercises count weightKg × 2 since both hands carry a load; bodyweight-plus counts the added kg only; timed rows contribute nothing.
- Per-exercise summary lines in the "Last" format, completed sets only.
- If any real rows are unticked: a warn-coloured line "N unticked sets will be discarded", naming the exercise when there is only one. Ghost rows are not mentioned.
- If nothing is ticked: the tiles show zeros and the line reads "Nothing logged. This workout will be discarded."
- Buttons: "Keep going" (secondary) and "Finish" (primary). Finish behaves exactly as today's finish function, plus ghost deletion.
- Android back closes the sheet.

**Technique sheet.** Bottom sheet, 90% of viewport height, opened from the thumbnail or name.

- Title: exercise name.
- Pill row: primary muscles joined with " · ", rep range "10–15 reps", load mode when not total ("per hand", "+ kg", "seconds"), and warn pills "Back" and "Knee" when the caution flags are set.
- Media slot: 4:3, black background, 18 px radius. Shows the exercise's animated WebP looping, `object-fit: contain`. When no visual exists: a static placeholder silhouette in `--raised` with the text "No animation yet".
- Cue list: three to five lines from the exercise's `cues` array. Lines flagged as cautions render with a warn "!" badge; the rest are numbered.
- "Watch on YouTube": a quiet button that opens `https://www.youtube.com/results?search_query=<exercise name> form` in a new tab. Needs network; it is a fallback, not the feature.
- "Done" button closes. Android back closes.
- Custom machines: no media, empty cues, YouTube button only.

### Exercise picker

Restyle only. Full-screen overlay slides up. Search field 56 px. List items 56 px with a 44 px thumbnail (or letter tile) on the left and caution pills on the right. Sections and behaviour unchanged: recent at this outlet, categories, collapsed Gated, "+ Add custom machine here".

### Custom machine sheet

Restyle as a bottom sheet in the system. Fields and behaviour unchanged. Step chips become 1.25 / 2.5 / 5 / 10 / custom to match the step pill on cards (7 is dropped; no Anytime Fitness stack Shafi has used steps by 7).

### Cardio

- Modality chooser becomes a three-way segmented control.
- Zone 2 and Bike: same fields as today in the new style, rows of label + stepper.
- 4x4: replaces four cards of three steppers each with:
  - Session block: label "Session · 38 min" using `durationMin`, and a timeline bar. Segments: warm-up, then work/rest alternating for four intervals (work 4, rest 3 from seed defaults, last interval has no rest), then cool-down. Warm-up and cool-down each take half of whatever `durationMin` leaves after the intervals, clamped at zero when the duration is shorter than the intervals; display rounded to the nearest minute. Labels under the bar: "warm-up 5 · work 4 · rest 3 · ×4 · cool 5".
  - Work intervals block: Speed and Incline steppers, applied to all four intervals. Changing a shared value rewrites it into every interval whose value still equals the previous shared value, so overridden rows keep their override.
  - Interval table: columns #, Speed, Incl, Peak HR. Speed and incline cells show the shared value in muted text. Tapping one turns that cell into a stepper for that row only and marks it with a small accent dot. Peak HR is a stepper per row, starting empty.
  - Avg HR and Max HR steppers.
  - RPE: five chips 6 to 10, optional, tapping the selected one clears it. Replaces the RPE stepper on all three modalities.
  - Note, then "Save cardio".
- Storage is unchanged: `speedKph` and `inclinePct` on the session hold the shared values; each `intervals[i]` stores its effective speed, incline and peak HR. Export shape does not move.
- Prefill from the last session of the same modality copies duration, shared speed and incline, and per-interval speed and incline overrides. It clears avg HR, max HR, peak HR, RPE and the note, because those describe the session being logged, not the plan. (Today's code copies the HR fields too; that changes.) An interval whose stored speed or incline differs from the shared value renders as overridden.

### Bodyweight

Restyle only.

### Export sheet

"Export JSON" on Home opens a bottom sheet instead of acting immediately.

- Shows the file name and size.
- "Share or download": tries the Web Share API with the file, then falls back to an anchor download, as today.
- "Copy JSON": writes the text to the clipboard and shows "Copied" on success.
- If copy fails (plain HTTP has no clipboard API), the sheet expands a read-only textarea containing the JSON with a "Select all" button, so the text can be copied by hand.
- On HTTPS (GitHub Pages) the first two paths work and the textarea never appears.

## Data changes

- `SetRow` gains `ghost?: boolean`. No index. Bump the Dexie schema to version 2 with identical store definitions so the change is recorded; no migration code is needed because no production data exists yet.
- `Exercise` gains `cues: string[]` and `visualId: string | null` in seed.json and the type. Cues are short imperative sentences, at most five per exercise, at most about 70 characters each, caution lines prefixed with "!" so the sheet can badge them. `visualId` is the ExerciseDB free-tier `exerciseId` the visual was fetched from, or null.
- `theme_color` and `background_color` in the PWA manifest and the `theme-color` meta in `index.html` become `#0b0b0d`.
- Seed fix: Leg Press `defaultIncrementKg` becomes 2.5. The per-machine step pill covers the cases where a specific leg press really moves in 10 kg plates.
- Custom machines created from the sheet get `cues: []` and `visualId: null`.

## Technique visuals pipeline

Developer-side, run once, output committed. Not part of the app runtime.

1. `scripts/fetch_visuals.py` (Python 3, Pillow; both already on the Mac) reads `src/data/seed.json`.
2. For each exercise with a `visualId`, fetch `https://oss.exercisedb.dev/api/v1/exercises/<visualId>` for the `gifUrl` and `instructions`, then download the GIF.
3. Processing per GIF: split frames, key near-white (every channel above 235) to transparent, trim to the figure's bounding box with 6% padding, keep the native 180 px resolution (upscaling helps nothing), encode as animated WebP, lossy quality 80, preserving frame timings. The red muscle highlight is kept as is.
4. Write to `public/visuals/<seed exercise id>.webp`. Add `webp` to the service worker `globPatterns` so the files precache.
5. Print a size report. Budget: under 5 MB total for all visuals.
6. Mapping `visualId` is a manual step the builder does before running the script: search the free API by name for each of the 31 seed exercises, pick the closest variant, record it in seed.json, and list the unmatched ones in the handoff notes. The API's `instructions` array is the starting material for the `cues`, cut down to the short imperative lines described above and merged with the existing `note` and caution flags.
7. README gets a line: technique visuals are prototype assets from the free ExerciseDB tier for personal use; replace with a licensed pack before any wider distribution.

## Acceptance

The PLAN.md acceptance test still applies unchanged: airplane mode, installed PWA, Tampines West, Leg Press, three sets by ✓ only after one weight change, custom machine, finish, export, reopen and see "Last time".

Added checks, same conditions:

1. Starting a second workout and adding Leg Press shows the "Last" line and faint ghost rows, and the page reads as empty. Ticking a ghost row takes one tap.
2. The Leg Press stepper moves in 2.5 kg. Tapping the step pill and choosing 5 changes it to 5 kg for that machine only.
3. On Kettlebell Swing the "…" chip accepts 18 and selects it. After ticking that set and finishing, 18 appears as a chip next time.
4. Finish is below Add exercise. Tapping it opens the summary sheet. Keep going returns without change. Android back also returns.
5. A 4x4 session can be logged with two taps per interval (peak HR − or +) after setting speed and incline once. Overriding interval 3's speed marks it and exports the overridden value.
6. The technique sheet opens for Leg Press in airplane mode and the animation plays.
7. Export over plain HTTP still produces the JSON text on screen; over HTTPS the share sheet or download works.
8. Lighthouse PWA installability passes on the deployed site, and the precache includes the fonts and visuals.

## Left to the builder

- Component boundaries and file layout, as long as screens stay one file each and shared pieces live in `src/components/`.
- Exact spring and easing values within the durations above.
- How bottom sheets push and pop history entries so Android back works; one approach is a single `useSheet` hook that pushes state on open and listens for popstate.
- Thumbnail placeholder design.
- Whether the step chip row lives inline in the card or in a tiny sheet.
- Exact wording of cues, within the limits set above, for Shafi to review in seed.json afterwards.
- Font subsetting tool and the exact woff2 files, as long as the four weights ship and nothing loads from Google at runtime.

## Open decisions recorded

- Ghost rows over a one-row start or a "Repeat last" button: chosen by Shafi on 2026-10-31 by accepting the mockups, all of which showed ghost rows.
- Red muscle highlight over green: Claude's recommendation, shown in both variants; Shafi did not object. Red stays.
- Free tier first, licensed pack later: Shafi's decision 2026-10-31.
- Manrope over Inter: Claude's call after the design linter flagged Inter as overused. Shafi saw Manrope in the second and third mockup pages.
