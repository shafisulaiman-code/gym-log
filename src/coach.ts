// The coaching rules as pure functions over the raw tables (no database access).
// This file holds the foundations (lift keys, sessions, working weight, Epley,
// load steps and the target formatter) and the nudge rule with its copy.
import { kettlebellSizesKg } from './db'
import type { GymData } from './export'
import { formatSession, keyedByEquipment, ratingOf, weightStep } from './history'
import type { CoachState, CoachTag, Equipment, Exercise, LightWeek, SetRow, Workout } from './types'
import { fmt, shortOutlet } from './util'
import { dateOf, daysBetween, inWeek, weekOf } from './week'
import { bellSizes } from './weights'

// rows: completed, seq ascending, warm-ups included.
export type Session = { workout: Workout; rows: SetRow[]; light: boolean }

// Machines and cables are keyed per physical machine, so the same machine at two
// outlets never mixes; everything else by exercise.
export function keyOf(ex: Exercise, row: SetRow): string {
  return keyedByEquipment(ex) && row.equipmentId ? `eq:${row.equipmentId}` : `ex:${ex.id}`
}

export function inLightWeek(iso: string, lightWeeks: LightWeek[]): boolean {
  return lightWeeks.some((w) => w.startedAt <= iso && iso < w.endsAt)
}

// Finished strength workouts with at least one working set for the key, oldest first.
export function sessionsFor(data: GymData, key: string): Session[] {
  const exercises = new Map(data.exercises.map((e) => [e.id, e]))
  const out: Session[] = []
  const workouts = data.workouts
    .filter((w) => w.endedAt && w.type === 'strength')
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
  for (const workout of workouts) {
    const rows = data.sets
      .filter((s) => {
        const ex = exercises.get(s.exerciseId)
        return s.workoutId === workout.id && s.completedAt && ex && keyOf(ex, s) === key
      })
      .sort((a, b) => a.seq - b.seq)
    if (!rows.some((r) => !r.isWarmup)) continue
    out.push({ workout, rows, light: inLightWeek(workout.startedAt, data.coach.lightWeeks) })
  }
  return out
}

// Reps, or seconds for timed lifts; 0 when missing.
export function countOf(ex: Exercise, row: SetRow): number {
  return (ex.loadMode === 'timed' ? row.durationSec : row.reps) ?? 0
}

function workingRows(rows: SetRow[]): SetRow[] {
  return rows.filter((r) => r.completedAt && !r.isWarmup).sort((a, b) => a.seq - b.seq)
}

// The heaviest weight used in at least two working sets, else the heaviest.
// counts are the reps (or seconds) of the working sets at that weight, in seq order.
export function workingWeight(ex: Exercise, rows: SetRow[]): { w: number; counts: number[] } {
  const work = workingRows(rows)
  if (work.length === 0) return { w: 0, counts: [] }
  const uses = new Map<number, number>()
  for (const r of work) uses.set(r.weightKg ?? 0, (uses.get(r.weightKg ?? 0) ?? 0) + 1)
  const weights = [...uses.keys()].sort((a, b) => b - a)
  const w = weights.find((x) => uses.get(x)! >= 2) ?? weights[0]
  return { w, counts: work.filter((r) => (r.weightKg ?? 0) === w).map((r) => countOf(ex, r)) }
}

// Epley estimate, unrounded, from the best working set of 1 to 15 reps.
// Rough when that set had more than 10 reps.
export function e1rm(ex: Exercise, rows: SetRow[]): { kg: number; rough: boolean } | null {
  if (ex.loadMode === 'bodyweight_plus' || ex.loadMode === 'timed' || ex.loadMode === 'height_cm') return null
  let best: { kg: number; rough: boolean } | null = null
  for (const r of workingRows(rows)) {
    const reps = r.reps ?? 0
    if (reps < 1 || reps > 15 || r.weightKg === undefined) continue
    const kg = r.weightKg * (1 + reps / 30)
    if (!best || kg > best.kg) best = { kg, rough: reps > 10 }
  }
  return best
}

// Reps-only lifts have no load to move.
export function isRepsOnly(ex: Exercise, w: number): boolean {
  return ex.defaultIncrementKg === 0 || (ex.loadMode === 'bodyweight_plus' && w === 0)
}

// The load `steps` steps from w (1 up, -1 or -2 down), or null when there is none.
export function nextLoad(
  ex: Exercise,
  eq: Equipment | undefined,
  bells: number[],
  w: number,
  steps: 1 | -1 | -2,
): number | null {
  if (isRepsOnly(ex, w)) return null
  if (ex.equipmentType === 'kettlebell') {
    const sizes = bellSizes(kettlebellSizesKg, bells)
    const at = sizes.indexOf(w)
    let i: number
    if (at >= 0) i = at + steps
    else if (steps > 0) i = sizes.findIndex((s) => s > w)
    else i = sizes.filter((s) => s < w).length + steps
    return i >= 0 && i < sizes.length ? sizes[i] : null
  }
  const step = weightStep(ex, eq)
  const next = Math.round((w + steps * step) * 100) / 100
  return next < step ? null : next
}

// The light-week load: bells, per hand and reps-only lifts keep the weight and
// halve the sets; everything else drops about ten percent on the step.
export function lightLoad(
  ex: Exercise,
  eq: Equipment | undefined,
  w: number,
  sets: number,
): { w: number; sets: number } {
  if (ex.equipmentType === 'kettlebell' || ex.loadMode === 'per_hand' || isRepsOnly(ex, w)) {
    return { w, sets: Math.ceil(sets / 2) }
  }
  const step = weightStep(ex, eq)
  return { w: Math.max(step, Math.floor((0.9 * w) / step) * step), sets }
}

// e.g. "102.5 × 10", "16 ph × 10", "BW+10 × 12", "BW × 12", "24 × 45s", "60s"
export function formatTarget(ex: Exercise, w: number, count: number): string {
  if (ex.loadMode === 'timed') return w > 0 ? `${fmt(w)} × ${fmt(count)}s` : `${fmt(count)}s`
  if (ex.loadMode === 'bodyweight_plus') return `${w > 0 ? `BW+${fmt(w)}` : 'BW'} × ${fmt(count)}`
  if (ex.loadMode === 'per_hand') return `${fmt(w)} ph × ${fmt(count)}`
  if (ex.loadMode === 'height_cm') return `${fmt(w)} cm × ${fmt(count)}`
  return `${fmt(w)} × ${fmt(count)}`
}

export type Suggestion =
  | { state: 'light'; tag: 'light'; w: number; count: number; sets: number }
  | { state: 'hold' } // no tap
  | { state: 'drop' | 'up' | 'reps'; tag: CoachTag; w: number; count: number; sets: number }
  | { state: 'reset'; tag: 'reset'; w: number; count: number; sets: number; stall: number }
  | { state: 'text'; kicker: string; text: string } // no tap

// A stalled lift, computed by the stall rule.
export type Stall = { sessions: number; w: number; reps: number }

export type SuggestInput = {
  ex: Exercise
  eq?: Equipment
  bells: number[]
  sessions: Session[] // for the key, oldest first, light sessions already removed
  lightWeekRunning: boolean
  stall: Stall | null
}

// "10" or "45s".
function repeatCount(ex: Exercise, count: number): string {
  return ex.loadMode === 'timed' ? `${fmt(count)}s` : fmt(count)
}

// The nudge for the next session of a lift, or null when there is nothing to say.
// Precedence: light, hold, drop, reset, up, reps.
export function suggestNext(input: SuggestInput): Suggestion | null {
  const { ex, eq, bells, sessions, lightWeekRunning, stall } = input
  if (sessions.length === 0 || ex.loadMode === 'height_cm') return null
  const last = sessions[sessions.length - 1]
  const { w, counts } = workingWeight(ex, last.rows)
  const n = workingRows(last.rows).length
  const [lo, hi] = ex.repRange
  const timed = ex.loadMode === 'timed'
  const repsOnly = isRepsOnly(ex, w)
  const bell = ex.equipmentType === 'kettlebell'

  if (lightWeekRunning) {
    const l = lightLoad(ex, eq, w, n)
    return { state: 'light', tag: 'light', w: l.w, count: lo, sets: l.sets }
  }

  const effort = ratingOf(last.rows).rpe ?? 8
  if (effort >= 10) return { state: 'hold' }

  // Two short: each of the last two sessions has a count at its own working weight below the range.
  const short = (s: Session) => workingWeight(ex, s.rows).counts.some((c) => c < lo)
  if (!repsOnly && sessions.length >= 2 && sessions.slice(-2).every(short)) {
    const down = nextLoad(ex, eq, bells, w, -1)
    if (down === null) return { state: 'text', kicker: 'Two short', text: `Repeat ${formatSession(ex, last.rows)}` }
    return { state: 'drop', tag: 'drop', w: down, count: lo, sets: n }
  }

  // The reps target: one more than the fewest (five more seconds for timed), never below
  // the middle count, capped at the top of the range.
  const sorted = [...counts].sort((a, b) => a - b)
  const median = sorted[Math.floor((sorted.length - 1) / 2)]
  const repsTarget = Math.min(hi, Math.max(sorted[0] + (timed ? 5 : 1), median))

  if (stall) {
    const kicker = `Stalled ${stall.sessions} sessions`
    if (repsOnly) {
      const again = `Repeat ${repeatCount(ex, repsTarget)}`
      return { state: 'text', kicker, text: timed && w === 0 ? again : `${again}, then add load` }
    }
    const down = nextLoad(ex, eq, bells, w, -2)
    if (down === null) return { state: 'text', kicker, text: `Repeat ${formatSession(ex, last.rows)}` }
    return { state: 'reset', tag: 'reset', w: down, count: lo, sets: n, stall: stall.sessions }
  }

  const mid = Math.ceil((lo + hi) / 2)
  const atTop = counts.every((c) => c >= hi)
  if ((atTop && effort <= 9) || (counts.every((c) => c >= mid) && effort <= 7)) {
    const up = nextLoad(ex, eq, bells, w, 1)
    if (up !== null) return { state: 'up', tag: 'up', w: up, count: lo, sets: n }
    if (atTop) {
      if (bell) return { state: 'text', kicker: 'Top of the range', text: 'Try a bigger bell' }
      const again = `Repeat ${repeatCount(ex, hi)}`
      return { state: 'text', kicker: 'Top of the range', text: timed && w === 0 ? again : `${again}, then add load` }
    }
  }

  return { state: 'reps', tag: 'reps', w, count: repsTarget, sets: n }
}

const SET_WORDS = ['', 'one', 'two', 'three', 'four']

// The kicker and text of the nudge line.
export function lineFor(ex: Exercise, s: Suggestion, lastRows: SetRow[]): { kicker: string; text: string } {
  switch (s.state) {
    case 'text':
      return { kicker: s.kicker, text: s.text }
    case 'hold':
      return { kicker: 'Hold', text: `Last one was a 10. Repeat ${formatSession(ex, lastRows)}` }
    case 'light': {
      const halves = ex.equipmentType === 'kettlebell' || ex.loadMode === 'per_hand' || isRepsOnly(ex, s.w)
      const sets = SET_WORDS[s.sets] || String(s.sets)
      const target = formatTarget(ex, s.w, s.count)
      return { kicker: 'Light week', text: halves ? `${target}, ${sets} ${s.sets === 1 ? 'set' : 'sets'}` : target }
    }
    case 'drop':
      return { kicker: 'Two short', text: `Try ${formatTarget(ex, s.w, s.count)}` }
    case 'reset':
      return { kicker: `Stalled ${s.stall} sessions`, text: `Reset to ${formatTarget(ex, s.w, s.count)}` }
    default:
      return { kicker: 'Feeling good?', text: formatTarget(ex, s.w, s.count) }
  }
}

// ---------------------------------------------------------------------------
// Progress, stalls and PRs
// ---------------------------------------------------------------------------

// Lexicographic compare of two scores: negative, zero or positive.
function compareScores(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

const sum = (xs: number[]) => xs.reduce((t, x) => t + x, 0)

// Session b over session a: a heavier working weight, more total reps (or seconds)
// at an equal weight, or a higher estimated one-rep max. Compared unrounded.
export function progressed(ex: Exercise, a: Session, b: Session): boolean {
  const wa = workingWeight(ex, a.rows)
  const wb = workingWeight(ex, b.rows)
  if (wb.w > wa.w) return true
  if (wb.w === wa.w && sum(wb.counts) > sum(wa.counts)) return true
  const ea = e1rm(ex, a.rows)
  const eb = e1rm(ex, b.rows)
  return ea !== null && eb !== null && eb.kg > ea.kg
}

// Sessions outside light weeks, and none from before the latest light week began: a
// light week restarts the stall and drop counts.
function freshSessions(sessions: Session[], lightWeeks: LightWeek[]): Session[] {
  const since = lightWeeks.map((w) => w.startedAt).sort().pop()
  return sessions.filter((s) => !s.light && (since === undefined || s.workout.startedAt >= since))
}

// A lift with three or more sessions in a row without progress. Light sessions are
// dropped, and the count starts again after a light week and after the latest session
// tagged 'reset' (the three sessions must all come after it). `sessions` is the length of
// the trailing no-progress run plus one; `reps` is the median count at the working weight
// of the latest session.
export function stallOf(ex: Exercise, sessions: Session[], lightWeeks: LightWeek[] = []): Stall | null {
  if (ex.loadMode === 'height_cm') return null
  let list = freshSessions(sessions, lightWeeks)
  const reset = list.map((s) => s.rows.some((r) => r.coach === 'reset')).lastIndexOf(true)
  if (reset >= 0) list = list.slice(reset + 1)
  if (list.length < 3) return null
  let run = 0
  for (let i = list.length - 1; i > 0 && !progressed(ex, list[i - 1], list[i]); i--) run++
  if (run < 2) return null
  const { w, counts } = workingWeight(ex, list[list.length - 1].rows)
  const sorted = [...counts].sort((a, b) => a - b)
  return { sessions: run + 1, w, reps: sorted[Math.floor((sorted.length - 1) / 2)] }
}

// What a PR compares: the estimate for lifts that have one; added load then reps for
// bodyweight lifts; load then seconds for timed ones; nothing for box height.
export function score(ex: Exercise, rows: SetRow[]): number[] | null {
  if (ex.loadMode === 'height_cm') return null
  if (ex.loadMode === 'bodyweight_plus' || ex.loadMode === 'timed') {
    const work = workingRows(rows)
    if (work.length === 0) return null
    const load = Math.max(...work.map((r) => r.weightKg ?? 0))
    return [load, Math.max(...work.filter((r) => (r.weightKg ?? 0) === load).map((r) => countOf(ex, r)))]
  }
  const est = e1rm(ex, rows)
  return est ? [est.kg] : null
}

// `earlier`: finished sessions before this one, light ones excluded. Needs two earlier
// sessions that have a score, and a score strictly above every one of them.
export function isPr(ex: Exercise, earlier: Session[], rows: SetRow[]): boolean {
  const before = earlier.map((s) => score(ex, s.rows)).filter((x): x is number[] => x !== null)
  const now = score(ex, rows)
  if (before.length < 2 || now === null) return false
  return before.every((b) => compareScores(now, b) > 0)
}

// ---------------------------------------------------------------------------
// Light week triggers
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000
const RECENT_DAYS = 28
const TIME_DAYS = 42

export function lightWeekRunning(state: CoachState, now: string): LightWeek | null {
  const t = Date.parse(now)
  return state.lightWeeks.find((w) => Date.parse(w.startedAt) <= t && t < Date.parse(w.endsAt)) ?? null
}

export function daysLeft(lw: LightWeek, now: string): number {
  return Math.max(0, Math.ceil((Date.parse(lw.endsAt) - Date.parse(now)) / DAY_MS))
}

export type Lift = { key: string; ex: Exercise; sessions: Session[] }

// Every lift key with a finished working session, with its sessions oldest first.
function lifts(data: GymData): Lift[] {
  const exercises = new Map(data.exercises.map((e) => [e.id, e]))
  const finished = new Set(data.workouts.filter((w) => w.endedAt && w.type === 'strength').map((w) => w.id))
  const keys = new Map<string, Exercise>()
  for (const row of data.sets) {
    const ex = exercises.get(row.exerciseId)
    if (ex && row.completedAt && finished.has(row.workoutId)) keys.set(keyOf(ex, row), ex)
  }
  const out: Lift[] = []
  for (const [key, ex] of keys) {
    const sessions = sessionsFor(data, key)
    if (sessions.length > 0) out.push({ key, ex, sessions })
  }
  return out
}

const latestOf = (l: Lift) => l.sessions[l.sessions.length - 1].workout.startedAt

type StalledLift = Lift & { stall: Stall }

// Light weeks that have begun by `now`.
function begun(data: GymData, now: string): LightWeek[] {
  return data.coach.lightWeeks.filter((w) => Date.parse(w.startedAt) <= Date.parse(now))
}

// Lifts whose latest session is within the last 28 days.
function recentLifts(all: Lift[], now: string): Lift[] {
  return all.filter((l) => daysBetween(dateOf(latestOf(l)), dateOf(now)) <= RECENT_DAYS)
}

// Stalled recent lifts, latest session first.
function recentStalls(data: GymData, now: string, all: Lift[]): StalledLift[] {
  const weeks = begun(data, now)
  const out: StalledLift[] = []
  for (const l of recentLifts(all, now)) {
    const stall = stallOf(l.ex, l.sessions, weeks)
    if (stall) out.push({ ...l, stall })
  }
  return out.sort((a, b) => latestOf(b).localeCompare(latestOf(a)))
}

// Two transitions among the last four sessions (after the latest light week began)
// where the estimate fell by more than 5 percent.
function hasDrops(l: Lift, lightWeeks: LightWeek[]): boolean {
  const last = freshSessions(l.sessions, lightWeeks).slice(-4)
  let drops = 0
  for (let i = 1; i < last.length; i++) {
    const a = e1rm(l.ex, last[i - 1].rows)
    const b = e1rm(l.ex, last[i].rows)
    if (a && b && b.kg < a.kg * 0.95) drops++
  }
  return drops >= 2
}

// Why a light week is due, checked in this order; null while one runs or is snoozed.
export function lightWeekDue(
  data: GymData,
  now: string,
  all: Lift[] = lifts(data), // precomputed by callers that already built them
): 'stalls' | 'drops' | 'time' | null {
  const { coach } = data
  if (lightWeekRunning(coach, now)) return null
  if (coach.lightWeekSnoozedUntil && Date.parse(coach.lightWeekSnoozedUntil) > Date.parse(now)) return null
  if (recentStalls(data, now, all).length >= 2) return 'stalls'
  const weeks = begun(data, now)
  if (recentLifts(all, now).some((l) => hasDrops(l, weeks))) return 'drops'
  const lastEnd = coach.lightWeeks.map((w) => w.endsAt).sort().pop()
  const first = data.workouts
    .filter((w) => w.endedAt && w.type === 'strength')
    .map((w) => w.startedAt)
    .sort()[0]
  const since = lastEnd ?? first
  if (since && daysBetween(dateOf(since), dateOf(now)) >= TIME_DAYS) return 'time'
  return null
}

// ---------------------------------------------------------------------------
// The coach card rows and the per-lift history
// ---------------------------------------------------------------------------

export type CoachRow =
  | { kind: 'light-running'; daysLeft: number }
  | { kind: 'light-due'; reason: 'stalls' | 'drops' | 'time' }
  | { kind: 'stall'; key: string; exerciseId: string; title: string; detail: string }
  | { kind: 'pr'; key: string; exerciseId: string; title: string; detail: string; date: string }

// "Leg Press · Tampines West" for a machine key, the exercise name otherwise.
export function keyTitle(data: GymData, ex: Exercise, key: string): string {
  if (key.startsWith('eq:')) {
    const eq = data.equipment.find((e) => e.id === key.slice(3))
    const outlet = eq && data.outlets.find((o) => o.id === eq.outletId)
    if (outlet) return `${ex.name} · ${shortOutlet(outlet.name)}`
  }
  return ex.name
}

// "BW+10", "BW" or a plain load, for the best-set wording.
function loadLabel(ex: Exercise, load: number): string {
  if (ex.loadMode === 'bodyweight_plus') return load > 0 ? `BW+${fmt(load)}` : 'BW'
  return fmt(load)
}

function prDetail(ex: Exercise, earlier: Session[], rows: SetRow[]): string {
  const now = score(ex, rows)!
  if (ex.loadMode === 'bodyweight_plus' || ex.loadMode === 'timed') {
    const best = ex.loadMode === 'timed' ? `${fmt(now[1])}s` : `${fmt(now[1])} reps`
    return now[0] > 0 || ex.loadMode === 'bodyweight_plus'
      ? `best set ${best} at ${loadLabel(ex, now[0])}`
      : `best set ${best}`
  }
  const prev = Math.max(...earlier.map((s) => score(ex, s.rows)?.[0] ?? 0))
  return `e1RM ${Math.round(now[0])} kg, up from ${Math.round(prev)}`
}

// Light row, then stalls (latest session first), then this calendar week's PRs (newest first).
export function coachRows(data: GymData, now: string): CoachRow[] {
  const all = lifts(data)
  const rows: CoachRow[] = []
  const running = lightWeekRunning(data.coach, now)
  if (running) rows.push({ kind: 'light-running', daysLeft: daysLeft(running, now) })
  else {
    const reason = lightWeekDue(data, now, all)
    if (reason) rows.push({ kind: 'light-due', reason })
  }

  for (const l of recentStalls(data, now, all)) {
    rows.push({
      kind: 'stall',
      key: l.key,
      exerciseId: l.ex.id,
      title: keyTitle(data, l.ex, l.key),
      detail: `stalled: ${l.stall.sessions} sessions at ${formatTarget(l.ex, l.stall.w, l.stall.reps)}`,
    })
  }

  const week = weekOf(now)
  const prs: { at: string; row: CoachRow }[] = []
  for (const l of all) {
    const plain = l.sessions.filter((s) => !s.light)
    plain.forEach((s, i) => {
      if (!inWeek(s.workout.startedAt, week)) return
      const earlier = plain.slice(0, i)
      if (!isPr(l.ex, earlier, s.rows)) return
      prs.push({
        at: s.workout.startedAt,
        row: {
          kind: 'pr',
          key: l.key,
          exerciseId: l.ex.id,
          title: keyTitle(data, l.ex, l.key),
          detail: prDetail(l.ex, earlier, s.rows),
          date: dateOf(s.workout.startedAt),
        },
      })
    })
  }
  prs.sort((a, b) => b.at.localeCompare(a.at))
  // One row per lift: its newest PR this week.
  const seen = new Set<string>()
  const newest = prs.filter((p) => p.row.kind === 'pr' && !seen.has(p.row.key) && seen.add(p.row.key))
  return [...rows, ...newest.map((p) => p.row)]
}

export type HistoryPoint = { session: Session; e1rm: { kg: number; rough: boolean } | null; pr: boolean }

// The last `limit` sessions of a lift, oldest first, light ones included (never a PR).
// PRs are judged against every earlier session, not only the shown ones. `best` is the
// shown point with the highest score (the earliest when tied), null when none has one.
export function history(
  data: GymData,
  ex: Exercise,
  key: string,
  limit = 12,
): { points: HistoryPoint[]; best: HistoryPoint | null; stall: Stall | null } {
  const all = sessionsFor(data, key)
  const from = Math.max(0, all.length - limit)
  const points: HistoryPoint[] = all.slice(from).map((session, i) => ({
    session,
    e1rm: e1rm(ex, session.rows),
    pr:
      !session.light &&
      isPr(
        ex,
        all.slice(0, from + i).filter((s) => !s.light),
        session.rows,
      ),
  }))
  let best: HistoryPoint | null = null
  let bestScore: number[] | null = null
  for (const p of points) {
    const sc = score(ex, p.session.rows)
    if (sc && (!bestScore || compareScores(sc, bestScore) > 0)) {
      best = p
      bestScore = sc
    }
  }
  return { points, best, stall: stallOf(ex, all, data.coach.lightWeeks) }
}
