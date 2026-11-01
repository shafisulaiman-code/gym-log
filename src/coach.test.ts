import { describe, it, expect } from 'vitest'
import {
  countOf,
  e1rm,
  formatTarget,
  inLightWeek,
  isRepsOnly,
  keyOf,
  lightLoad,
  nextLoad,
  sessionsFor,
  workingWeight,
  type Session,
} from './coach'
import type { GymData } from './export'
import { eq, legPress } from './history.test'
import type { CoachState, CoachTag, Exercise, SetRow, Workout } from './types'

export const swing: Exercise = {
  ...legPress,
  id: 'kb-swing',
  name: 'Kettlebell Swing',
  equipmentType: 'kettlebell',
  loadMode: 'total',
  defaultIncrementKg: 4,
  repRange: [10, 20],
}
export const dbBench: Exercise = {
  ...legPress,
  id: 'db-bench',
  name: 'Dumbbell Bench Press',
  equipmentType: 'dumbbell',
  loadMode: 'per_hand',
  defaultIncrementKg: 2,
  repRange: [8, 12],
}
export const carry: Exercise = {
  ...legPress,
  id: 'kb-carry',
  name: 'Farmer Carry',
  equipmentType: 'kettlebell',
  loadMode: 'timed',
  repRange: [30, 60],
}
export const plank: Exercise = {
  ...legPress,
  id: 'bw-plank',
  name: 'Plank',
  equipmentType: 'bodyweight',
  loadMode: 'timed',
  defaultIncrementKg: 0,
  repRange: [30, 60],
}
export const deadBug: Exercise = {
  ...legPress,
  id: 'bw-dead-bug',
  name: 'Dead Bug',
  equipmentType: 'bodyweight',
  loadMode: 'bodyweight_plus',
  defaultIncrementKg: 0,
  repRange: [8, 12],
}
export const backExtension: Exercise = {
  ...legPress,
  id: 'bw-back-extension',
  name: 'Back Extension',
  equipmentType: 'bodyweight',
  loadMode: 'bodyweight_plus',
  defaultIncrementKg: 2.5,
  repRange: [10, 15],
}

let counter = 0

type Extra = { durationSec?: boolean; coach?: CoachTag; ex?: Exercise; equipmentId?: string }

// A finished strength workout with one exercise: sets are [weight, count, warm-up?].
// Rows are ticked one minute apart from 18:01 and the last row carries the rpe.
export function mkSession(
  date: string,
  sets: [number, number, boolean?][],
  rpe?: number,
  extra: Extra = {},
): { workout: Workout; rows: SetRow[] } {
  counter += 1
  const ex = extra.ex ?? legPress
  const workout: Workout = {
    id: `w${counter}`,
    startedAt: `${date}T18:00:00+08:00`,
    endedAt: `${date}T18:52:00+08:00`,
    outletId: 'o1',
    type: 'strength',
  }
  const rows: SetRow[] = sets.map(([w, n, warm], i) => ({
    id: `s${counter}-${i}`,
    workoutId: workout.id,
    exerciseId: ex.id,
    equipmentId: extra.equipmentId ?? 'eq1',
    setIndex: i,
    isWarmup: warm === true,
    weightKg: w,
    ...(extra.durationSec ? { durationSec: n } : { reps: n }),
    seq: counter * 100 + i,
    completedAt: `${date}T18:${String(i + 1).padStart(2, '0')}:00+08:00`,
    ...(i === sets.length - 1 && rpe !== undefined ? { rpe } : {}),
    ...(extra.coach ? { coach: extra.coach } : {}),
  }))
  return { workout, rows }
}

export function toSession(x: { workout: Workout; rows: SetRow[] }): Session {
  return { workout: x.workout, rows: x.rows, light: false }
}

export function mkData(
  sessions: { workout: Workout; rows: SetRow[] }[],
  exercises: Exercise[],
  coach: CoachState = { lightWeeks: [] },
): GymData {
  return {
    outlets: [
      { id: 'o1', name: 'AF Tampines West' },
      { id: 'o2', name: 'AF Orchard Gateway' },
    ],
    exercises,
    equipment: [eq],
    workouts: sessions.map((s) => s.workout),
    sets: sessions.flatMap((s) => s.rows),
    cardio: [],
    bodyweight: [],
    coach,
  }
}

describe('workingWeight', () => {
  it('takes the heaviest weight used in at least two sets', () => {
    const { rows } = mkSession('2026-10-31', [[60, 12, true], [100, 12], [100, 12], [105, 8]])
    expect(workingWeight(legPress, rows)).toEqual({ w: 100, counts: [12, 12] })
  })
  it('falls back to the heaviest when nothing repeats (pyramid)', () => {
    const { rows } = mkSession('2026-10-31', [[90, 12], [100, 10], [110, 8]])
    expect(workingWeight(legPress, rows)).toEqual({ w: 110, counts: [8] })
  })
  it('ignores warm-ups and reads seconds for timed lifts', () => {
    const { rows } = mkSession('2026-10-31', [[24, 45], [24, 40]], undefined, { durationSec: true })
    expect(workingWeight(carry, rows)).toEqual({ w: 24, counts: [45, 40] })
  })
})

describe('e1rm', () => {
  it('is Epley on the best working set, rough over ten reps', () => {
    const { rows } = mkSession('2026-10-31', [[100, 12], [100, 12], [100, 10]])
    expect(e1rm(legPress, rows)).toEqual({ kg: 140, rough: true }) // 100 * (1 + 12/30)
    const { rows: solid } = mkSession('2026-10-31', [[102.5, 10], [102.5, 9]])
    expect(e1rm(legPress, solid)).toEqual({ kg: 102.5 * (1 + 10 / 30), rough: false })
  })
  it('ignores sets over fifteen reps and has no value for bodyweight, timed or box height', () => {
    expect(e1rm(legPress, mkSession('2026-10-31', [[60, 20]]).rows)).toBeNull()
    expect(e1rm(deadBug, mkSession('2026-10-31', [[0, 12]]).rows)).toBeNull()
    expect(e1rm(carry, mkSession('2026-10-31', [[24, 45]], undefined, { durationSec: true }).rows)).toBeNull()
  })
})

describe('nextLoad and lightLoad', () => {
  it('steps machines by the equipment step and never below one step', () => {
    expect(nextLoad(legPress, eq, [], 100, 1)).toBe(102.5)
    expect(nextLoad(legPress, eq, [], 100, -2)).toBe(95)
    expect(nextLoad(legPress, eq, [], 2.5, -1)).toBeNull()
  })
  it('walks bell sizes and returns null past either end', () => {
    expect(nextLoad(swing, undefined, [], 16, 1)).toBe(20)
    expect(nextLoad(swing, undefined, [], 12, -2)).toBeNull()
    expect(nextLoad(swing, undefined, [], 32, 1)).toBeNull()
    expect(nextLoad(swing, undefined, [14], 12, 1)).toBe(14)
  })
  it('is null for reps-only lifts', () => {
    expect(nextLoad(deadBug, undefined, [], 0, 1)).toBeNull()
    expect(isRepsOnly(backExtension, 0)).toBe(true) // bodyweight_plus with nothing added
    expect(isRepsOnly(backExtension, 10)).toBe(false)
  })
  it('lightens machines by ten percent on the step and halves sets for bells and per hand', () => {
    expect(lightLoad(legPress, eq, 100, 3)).toEqual({ w: 90, sets: 3 })
    expect(lightLoad(legPress, eq, 102.5, 3)).toEqual({ w: 90, sets: 3 }) // floor(92.25 / 2.5) * 2.5 = 36 * 2.5
    expect(lightLoad(swing, undefined, 16, 3)).toEqual({ w: 16, sets: 2 })
    expect(lightLoad(dbBench, undefined, 26, 1)).toEqual({ w: 26, sets: 1 })
  })
})

describe('keys and counts', () => {
  it('keys machines by equipment and everything else by exercise', () => {
    const [{ rows }] = [mkSession('2026-10-31', [[100, 12]])]
    expect(keyOf(legPress, rows[0])).toBe('eq:eq1')
    expect(keyOf(dbBench, { ...rows[0], exerciseId: dbBench.id })).toBe('ex:db-bench')
  })
  it('counts seconds for timed lifts and reps otherwise, 0 when missing', () => {
    const { rows } = mkSession('2026-10-31', [[24, 45]], undefined, { durationSec: true })
    expect(countOf(carry, rows[0])).toBe(45)
    expect(countOf(legPress, rows[0])).toBe(0)
  })
  it('finds a light week by half-open interval', () => {
    const weeks = [{ startedAt: '2026-10-26T00:00:00+08:00', endsAt: '2026-11-02T00:00:00+08:00' }]
    expect(inLightWeek('2026-10-26T00:00:00+08:00', weeks)).toBe(true)
    expect(inLightWeek('2026-11-01T18:00:00+08:00', weeks)).toBe(true)
    expect(inLightWeek('2026-11-02T00:00:00+08:00', weeks)).toBe(false)
    expect(inLightWeek('2026-10-25T23:59:59+08:00', weeks)).toBe(false)
  })
})

describe('sessionsFor and formatTarget', () => {
  it('lists finished sessions for a key oldest first, flags light ones, skips the open workout', () => {
    const a = mkSession('2026-10-10', [[100, 12], [100, 12]])
    const b = mkSession('2026-10-24', [[100, 12], [100, 12]])
    const c = mkSession('2026-10-17', [[100, 12], [100, 12]])
    const open = mkSession('2026-10-30', [[105, 10], [105, 10]])
    delete open.workout.endedAt
    const warmOnly = mkSession('2026-10-20', [[60, 12, true]])
    const other = mkSession('2026-10-21', [[20, 10], [20, 10]], undefined, { ex: dbBench, equipmentId: undefined })
    const data = mkData([a, b, c, open, warmOnly, other], [legPress, dbBench], {
      lightWeeks: [{ startedAt: '2026-10-17T00:00:00+08:00', endsAt: '2026-10-24T00:00:00+08:00' }],
    })
    const out = sessionsFor(data, 'eq:eq1')
    expect(out.map((s) => s.workout.id)).toEqual([a.workout.id, c.workout.id, b.workout.id])
    expect(out.map((s) => s.light)).toEqual([false, true, false])
    expect(out[0].rows).toHaveLength(2)
    expect(sessionsFor(data, 'ex:db-bench').map((s) => s.workout.id)).toEqual([other.workout.id])
  })
  it('formats targets per load mode', () => {
    expect(formatTarget(legPress, 102.5, 10)).toBe('102.5 × 10')
    expect(formatTarget(dbBench, 16, 10)).toBe('16 ph × 10')
    expect(formatTarget(backExtension, 10, 12)).toBe('BW+10 × 12')
    expect(formatTarget(backExtension, 0, 12)).toBe('BW × 12')
    expect(formatTarget(carry, 24, 45)).toBe('24 × 45s')
    expect(formatTarget(plank, 0, 60)).toBe('60s')
  })
})
