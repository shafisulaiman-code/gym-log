// The coaching rules as pure functions over the raw tables (no database access).
// This file holds the foundations (lift keys, sessions, working weight, Epley,
// load steps and the target formatter) and the nudge rule with its copy.
import { kettlebellSizesKg } from './db'
import type { GymData } from './export'
import { formatSession, keyedByEquipment, ratingOf, weightStep } from './history'
import type { CoachTag, Equipment, Exercise, LightWeek, SetRow, Workout } from './types'
import { fmt } from './util'
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

  // The reps target: one more than the fewest, never below the middle count; five more seconds than the shortest for timed.
  const sorted = [...counts].sort((a, b) => a - b)
  const median = sorted[Math.floor((sorted.length - 1) / 2)]
  const repsTarget = Math.min(hi, timed ? sorted[0] + 5 : Math.max(sorted[0] + 1, median))

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
      return { kicker: 'Light week', text: halves ? `${target}, ${sets} sets` : target }
    }
    case 'drop':
      return { kicker: 'Two short', text: `Try ${formatTarget(ex, s.w, s.count)}` }
    case 'reset':
      return { kicker: `Stalled ${s.stall} sessions`, text: `Reset to ${formatTarget(ex, s.w, s.count)}` }
    default:
      return { kicker: 'Feeling good?', text: formatTarget(ex, s.w, s.count) }
  }
}
