// The coaching rules as pure functions over the raw tables (no database access).
// This file holds the foundations: lift keys, sessions, working weight, Epley,
// load steps and the target formatter.
import { kettlebellSizesKg } from './db'
import type { GymData } from './export'
import { keyedByEquipment, weightStep } from './history'
import type { Equipment, Exercise, LightWeek, SetRow, Workout } from './types'
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
