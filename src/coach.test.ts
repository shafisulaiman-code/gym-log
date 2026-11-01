import { describe, it, expect } from 'vitest'
import {
  coachRows,
  countOf,
  daysLeft,
  e1rm,
  formatTarget,
  history,
  inLightWeek,
  isPr,
  isRepsOnly,
  keyOf,
  keyTitle,
  lightLoad,
  lightWeekDue,
  lightWeekRunning,
  lineFor,
  nextLoad,
  progressed,
  score,
  sessionsFor,
  stallOf,
  suggestNext,
  workingWeight,
  type Session,
  type Stall,
  type Suggestion,
} from './coach'
import type { GymData } from './export'
import { boxJump, eq, legPress } from './history.test'
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

const S = (sets: [number, number, boolean?][], rpe?: number, date = '2026-10-31') => mkSession(date, sets, rpe)
const sug = (
  sessions: { workout: Workout; rows: SetRow[] }[],
  extra: { stall?: Stall | null; lightWeekRunning?: boolean } = {},
) =>
  suggestNext({
    ex: legPress,
    eq,
    bells: [],
    sessions: sessions.map(toSession),
    lightWeekRunning: false,
    stall: null,
    ...extra,
  })

describe('suggestNext', () => {
  it('offers reps: min plus one, never below the median', () => {
    expect(sug([S([[100, 12], [100, 12], [100, 10]], 8)])).toMatchObject({ state: 'reps', w: 100, count: 12, sets: 3 })
    expect(sug([S([[100, 12], [100, 12], [100, 12]], 8)])).toMatchObject({ state: 'reps', w: 100, count: 13 })
    expect(sug([S([[100, 12], [100, 11], [100, 10]], 9)])).toMatchObject({ state: 'reps', count: 11 })
    expect(sug([S([[100, 15], [100, 15], [100, 14]], 9)])).toMatchObject({ state: 'reps', count: 15 })
  })
  it('offers one step up at the top of the range at effort 9 or below', () => {
    expect(sug([S([[100, 15], [100, 15], [100, 15]], 9)])).toMatchObject({ state: 'up', w: 102.5, count: 10, tag: 'up' })
    expect(sug([S([[100, 15], [100, 15], [100, 15]])])).toMatchObject({ state: 'up' }) // unrated counts as 8
  })
  it('offers the step early when past the middle and it felt easy', () => {
    expect(sug([S([[100, 13], [100, 13], [100, 13]], 7)])).toMatchObject({ state: 'up', w: 102.5 })
    expect(sug([S([[100, 13], [100, 13], [100, 13]], 8)])).toMatchObject({ state: 'reps', count: 14 })
  })
  it('holds after a ten', () => {
    expect(sug([S([[100, 12], [100, 11], [100, 10]], 10)])).toEqual({ state: 'hold' })
  })
  it('drops one step after two short sessions, before any reset', () => {
    const two = [S([[100, 10], [100, 9], [100, 9]], 9, '2026-10-24'), S([[100, 10], [100, 9], [100, 8]], 9)]
    expect(sug(two)).toMatchObject({ state: 'drop', w: 97.5, count: 10, tag: 'drop' })
    expect(sug(two, { stall: { sessions: 3, w: 100, reps: 10 } })).toMatchObject({ state: 'drop' })
  })
  it('resets two steps down when stalled', () => {
    expect(sug([S([[100, 12], [100, 12], [100, 10]], 8)], { stall: { sessions: 3, w: 100, reps: 12 } })).toMatchObject({
      state: 'reset',
      w: 95,
      count: 10,
      tag: 'reset',
      stall: 3,
    })
  })
  it('lightens during a light week, whatever else is true', () => {
    expect(sug([S([[100, 15], [100, 15], [100, 15]], 9)], { lightWeekRunning: true })).toEqual({
      state: 'light',
      tag: 'light',
      w: 90,
      count: 10,
      sets: 3,
    })
    expect(
      suggestNext({
        ex: swing,
        bells: [],
        sessions: [toSession(mkSession('2026-10-31', [[16, 15]]))],
        lightWeekRunning: true,
        stall: null,
      }),
    ).toEqual({ state: 'light', tag: 'light', w: 16, count: 10, sets: 1 }) // one set halves to one, never zero
  })
  it('has nothing to say on a first session or for box jump', () => {
    expect(sug([])).toBeNull()
    expect(
      suggestNext({
        ex: boxJump,
        bells: [],
        sessions: [toSession(mkSession('2026-10-31', [[50, 5]]))],
        lightWeekRunning: false,
        stall: null,
      }),
    ).toBeNull()
  })
  it('turns text-only where there is no load to move', () => {
    const base = { bells: [], lightWeekRunning: false }
    expect(
      suggestNext({ ...base, ex: swing, sessions: [toSession(mkSession('2026-10-31', [[32, 20], [32, 20]], 8))], stall: null }),
    ).toEqual({ state: 'text', kicker: 'Top of the range', text: 'Try a bigger bell' })
    expect(
      suggestNext({
        ...base,
        ex: swing,
        sessions: [toSession(mkSession('2026-10-31', [[8, 8], [8, 8]], 9))],
        stall: { sessions: 3, w: 8, reps: 8 },
      }),
    ).toEqual({ state: 'text', kicker: 'Stalled 3 sessions', text: 'Repeat 8 × 8, 8' })
    expect(
      suggestNext({ ...base, ex: deadBug, sessions: [toSession(mkSession('2026-10-31', [[0, 12], [0, 12]], 8))], stall: null }),
    ).toEqual({ state: 'text', kicker: 'Top of the range', text: 'Repeat 12, then add load' })
    expect(
      suggestNext({
        ...base,
        ex: plank,
        sessions: [toSession(mkSession('2026-10-31', [[0, 60]], 8, { durationSec: true }))],
        stall: null,
      }),
    ).toEqual({ state: 'text', kicker: 'Top of the range', text: 'Repeat 60s' })
    expect(
      suggestNext({ ...base, ex: deadBug, sessions: [toSession(mkSession('2026-10-31', [[0, 10], [0, 9]], 8))], stall: null }),
    ).toMatchObject({ state: 'reps', w: 0, count: 10 })
  })
  it('steps timed lifts by five seconds and loaded timed lifts by a bell', () => {
    const base = { bells: [], lightWeekRunning: false, stall: null }
    expect(
      suggestNext({ ...base, ex: carry, sessions: [toSession(mkSession('2026-10-31', [[24, 45], [24, 40]], 8, { durationSec: true }))] }),
    ).toMatchObject({ state: 'reps', w: 24, count: 45 })
    // never below the middle count: 45, 60, 60 gives 60, not 50
    expect(
      suggestNext({ ...base, ex: carry, sessions: [toSession(mkSession('2026-10-31', [[24, 45], [24, 60], [24, 60]], 8, { durationSec: true }))] }),
    ).toMatchObject({ state: 'reps', w: 24, count: 60 })
    expect(
      suggestNext({ ...base, ex: carry, sessions: [toSession(mkSession('2026-10-31', [[24, 60], [24, 60]], 8, { durationSec: true }))] }),
    ).toMatchObject({ state: 'up', w: 28, count: 30 })
  })
  it('falls through to reps at the top of a reps-only lift that is not yet at the top', () => {
    const one = (count: number, ex: Exercise = deadBug) =>
      suggestNext({ ex, bells: [], sessions: [toSession(mkSession('2026-10-31', [[0, count], [0, count]], 7))], lightWeekRunning: false, stall: null })
    expect(one(11)).toMatchObject({ state: 'reps', w: 0, count: 12 }) // past the middle, but not at the top
  })
  it('writes text for a stalled reps-only lift and a drop or reset with no load below', () => {
    const base = { bells: [], lightWeekRunning: false }
    expect(
      suggestNext({
        ...base,
        ex: deadBug,
        sessions: [toSession(mkSession('2026-10-31', [[0, 10], [0, 9]], 8))],
        stall: { sessions: 4, w: 0, reps: 10 },
      }),
    ).toEqual({ state: 'text', kicker: 'Stalled 4 sessions', text: 'Repeat 10, then add load' })
    const two = [
      mkSession('2026-10-24', [[2.5, 9], [2.5, 9]], 9),
      mkSession('2026-10-31', [[2.5, 9], [2.5, 8]], 9),
    ].map(toSession)
    expect(suggestNext({ ...base, ex: legPress, eq, sessions: two, stall: null })).toEqual({
      state: 'text',
      kicker: 'Two short',
      text: 'Repeat 2.5 × 9, 8',
    })
  })
})
describe('lineFor', () => {
  it('writes the spec copy', () => {
    const last = S([[100, 12], [100, 11], [100, 10]], 10).rows
    expect(lineFor(legPress, { state: 'reps', tag: 'reps', w: 100, count: 12, sets: 3 }, last)).toEqual({ kicker: 'Feeling good?', text: '100 × 12' })
    expect(lineFor(legPress, { state: 'hold' }, last)).toEqual({ kicker: 'Hold', text: 'Last one was a 10. Repeat 100 × 12, 11, 10' })
    expect(lineFor(legPress, { state: 'drop', tag: 'drop', w: 97.5, count: 10, sets: 3 }, last)).toEqual({ kicker: 'Two short', text: 'Try 97.5 × 10' })
    expect(lineFor(legPress, { state: 'reset', tag: 'reset', w: 95, count: 10, sets: 3, stall: 3 }, last)).toEqual({ kicker: 'Stalled 3 sessions', text: 'Reset to 95 × 10' })
    expect(lineFor(dbBench, { state: 'light', tag: 'light', w: 16, count: 8, sets: 2 }, last)).toEqual({ kicker: 'Light week', text: '16 ph × 8, two sets' })
    expect(lineFor(legPress, { state: 'light', tag: 'light', w: 90, count: 10, sets: 3 }, last)).toEqual({ kicker: 'Light week', text: '90 × 10' })
  })
  it('passes text suggestions through and says two sets on a halved bell or reps-only lift', () => {
    const t: Suggestion = { state: 'text', kicker: 'Top of the range', text: 'Try a bigger bell' }
    expect(lineFor(swing, t, [])).toEqual({ kicker: 'Top of the range', text: 'Try a bigger bell' })
    expect(lineFor(swing, { state: 'light', tag: 'light', w: 16, count: 10, sets: 2 }, [])).toEqual({ kicker: 'Light week', text: '16 × 10, two sets' })
    expect(lineFor(deadBug, { state: 'light', tag: 'light', w: 0, count: 8, sets: 6 }, [])).toEqual({ kicker: 'Light week', text: 'BW × 8, 6 sets' })
    expect(lineFor(swing, { state: 'light', tag: 'light', w: 16, count: 10, sets: 1 }, [])).toEqual({ kicker: 'Light week', text: '16 × 10, one set' })
  })
})

const flat = (d: string) => S([[100, 12], [100, 12], [100, 10]], 8, d)
const NOW = '2026-11-01T10:00:00+08:00'

describe('progressed and score', () => {
  it('counts a higher weight, more reps at the weight, or a higher estimate', () => {
    const a = toSession(flat('2026-10-10'))
    expect(progressed(legPress, a, toSession(flat('2026-10-17')))).toBe(false)
    expect(progressed(legPress, a, toSession(S([[100, 12], [100, 12], [100, 11]])))).toBe(true)
    expect(progressed(legPress, a, toSession(S([[102.5, 8], [102.5, 8]])))).toBe(true)
    expect(progressed(legPress, a, toSession(S([[95, 12], [95, 12], [95, 12]])))).toBe(false)
  })
  it('counts a higher estimate even when the working weight did not move', () => {
    const a = toSession(S([[100, 10], [100, 10], [100, 8]]))
    const b = toSession(S([[100, 8], [100, 8], [105, 10]])) // working weight stays 100 (105 used once), best set rose
    expect(workingWeight(legPress, b.rows).w).toBe(100)
    expect(progressed(legPress, a, b)).toBe(true) // 105 * (1 + 10/30) = 140 > 133.3
  })
  it('scores by lift kind', () => {
    expect(score(legPress, S([[100, 12], [60, 12, true]]).rows)).toEqual([140])
    expect(score(backExtension, mkSession('2026-10-03', [[5, 8], [5, 10], [0, 15]]).rows)).toEqual([5, 10])
    expect(score(plank, mkSession('2026-10-03', [[0, 45], [0, 60]], undefined, { durationSec: true }).rows)).toEqual([0, 60])
    expect(score(carry, mkSession('2026-10-03', [[24, 45], [20, 60]], undefined, { durationSec: true }).rows)).toEqual([24, 45])
    expect(score(legPress, S([[60, 20]]).rows)).toBeNull()
  })
})

describe('stallOf', () => {
  it('needs three sessions without progress', () => {
    expect(stallOf(legPress, [flat('2026-10-10'), flat('2026-10-17')].map(toSession))).toBeNull()
    expect(stallOf(legPress, [flat('2026-10-10'), flat('2026-10-17'), flat('2026-10-24')].map(toSession))).toEqual({
      sessions: 3,
      w: 100,
      reps: 12,
    })
    expect(
      stallOf(legPress, [flat('2026-10-03'), flat('2026-10-10'), flat('2026-10-17'), flat('2026-10-24')].map(toSession))!.sessions,
    ).toBe(4)
  })
  it('counts only the trailing run, so earlier progress does not stall', () => {
    const rising = [S([[95, 12], [95, 12]], 8, '2026-10-03'), flat('2026-10-10'), flat('2026-10-17')]
    expect(stallOf(legPress, rising.map(toSession))).toBeNull() // one flat transition only
    expect(stallOf(legPress, [...rising, flat('2026-10-24')].map(toSession))!.sessions).toBe(3)
  })
  it('counts more reps, more weight or a higher estimate as progress', () => {
    expect(
      stallOf(legPress, [flat('2026-10-10'), flat('2026-10-17'), S([[100, 12], [100, 12], [100, 11]], 8, '2026-10-24')].map(toSession)),
    ).toBeNull()
    expect(
      stallOf(legPress, [flat('2026-10-10'), flat('2026-10-17'), S([[102.5, 10], [102.5, 9], [102.5, 8]], 9, '2026-10-24')].map(toSession)),
    ).toBeNull()
  })
  it('takes the lower middle count at the working weight as reps', () => {
    const four = (d: string) => S([[100, 12], [100, 12], [100, 10], [100, 10]], 8, d)
    expect(stallOf(legPress, [four('2026-10-10'), four('2026-10-17'), four('2026-10-24')].map(toSession))).toEqual({
      sessions: 3,
      w: 100,
      reps: 10,
    })
  })
  it('restarts after a reset session, and a drop session does not restart the count', () => {
    const reset = mkSession('2026-10-24', [[95, 10], [95, 10], [95, 10]], 8, { coach: 'reset' })
    expect(stallOf(legPress, [flat('2026-10-03'), flat('2026-10-10'), flat('2026-10-17'), reset].map(toSession))).toBeNull()
    // the three sessions must all come after the reset: reset plus two flat is not a stall
    const at95 = (d: string) => mkSession(d, [[95, 10], [95, 10], [95, 10]])
    const two = [flat('2026-10-03'), flat('2026-10-10'), reset, at95('2026-10-31'), at95('2026-11-07')]
    expect(stallOf(legPress, two.map(toSession))).toBeNull()
    const three = [...two, at95('2026-11-14')]
    expect(stallOf(legPress, three.map(toSession))).toEqual({ sessions: 3, w: 95, reps: 10 })
    const drop = mkSession('2026-10-24', [[100, 10], [100, 10], [100, 10]], 8, { coach: 'drop' })
    expect(stallOf(legPress, [flat('2026-10-03'), flat('2026-10-10'), flat('2026-10-17'), drop].map(toSession))!.sessions).toBe(4)
  })
  it('never stalls a box height', () => {
    const jump = (d: string) => mkSession(d, [[50, 5], [50, 5], [50, 5]], 8, { ex: boxJump })
    expect(stallOf(boxJump, [jump('2026-10-10'), jump('2026-10-17'), jump('2026-10-24')].map(toSession))).toBeNull()
  })
  it('restarts after a light week: three fresh sessions are needed', () => {
    const lw = [{ startedAt: '2026-10-20T00:00:00+08:00', endsAt: '2026-10-27T00:00:00+08:00' }]
    const before = [flat('2026-10-03'), flat('2026-10-10'), flat('2026-10-17')]
    expect(stallOf(legPress, before.map(toSession))!.sessions).toBe(3)
    expect(stallOf(legPress, before.map(toSession), lw)).toBeNull()
    const light = { ...toSession(flat('2026-10-22')), light: true }
    const two = [...before.map(toSession), light, toSession(flat('2026-10-28')), toSession(flat('2026-11-04'))]
    expect(stallOf(legPress, two, lw)).toBeNull()
    expect(stallOf(legPress, [...two, toSession(flat('2026-11-11'))], lw)).toEqual({ sessions: 3, w: 100, reps: 12 })
  })
  it('ignores light sessions', () => {
    const light = { ...toSession(flat('2026-10-17')), light: true }
    expect(stallOf(legPress, [toSession(flat('2026-10-03')), toSession(flat('2026-10-10')), light])).toBeNull()
    expect(stallOf(legPress, [toSession(flat('2026-10-03')), toSession(flat('2026-10-10')), light, toSession(flat('2026-10-24'))])!.sessions).toBe(3)
  })
})

describe('isPr', () => {
  const s1 = toSession(S([[95, 12]], 8, '2026-10-03'))
  const s2 = toSession(S([[100, 10]], 8, '2026-10-10'))
  it('needs two earlier sessions and a strictly higher estimate', () => {
    expect(isPr(legPress, [s1], S([[110, 12]]).rows)).toBe(false)
    expect(isPr(legPress, [s1, s2], S([[100, 12]]).rows)).toBe(true) // 140 > 133.3
    expect(isPr(legPress, [s1, s2], S([[100, 10]]).rows)).toBe(false)
  })
  it('counts only earlier sessions that have a score toward the two', () => {
    const empty = toSession(S([[60, 20]], 8, '2026-10-01')) // sets over fifteen reps: no estimate
    expect(isPr(legPress, [empty, s1, s2].slice(0, 2), S([[110, 12]]).rows)).toBe(false) // empty + s1 only
    expect(isPr(legPress, [empty, s1, s2], S([[110, 12]]).rows)).toBe(true)
  })
  it('compares bodyweight lifts by added load then reps, timed by load then seconds', () => {
    const a = toSession(mkSession('2026-10-03', [[0, 12]]))
    const b = toSession(mkSession('2026-10-10', [[0, 14]]))
    expect(isPr(backExtension, [a, b], mkSession('2026-10-17', [[0, 15]]).rows)).toBe(true)
    expect(isPr(backExtension, [a, b], mkSession('2026-10-17', [[5, 8]]).rows)).toBe(true)
    expect(isPr(backExtension, [a, b], mkSession('2026-10-17', [[0, 14]]).rows)).toBe(false)
    const t = (d: string, n: number, w = 24) => toSession(mkSession(d, [[w, n]], undefined, { durationSec: true, ex: carry }))
    const rows = (n: number, w: number) => mkSession('2026-10-17', [[w, n]], undefined, { durationSec: true, ex: carry }).rows
    expect(isPr(carry, [t('2026-10-03', 40), t('2026-10-10', 45)], rows(50, 24))).toBe(true)
    expect(isPr(carry, [t('2026-10-03', 40), t('2026-10-10', 45)], rows(30, 28))).toBe(true)
    expect(isPr(carry, [t('2026-10-03', 40), t('2026-10-10', 45)], rows(60, 20))).toBe(false)
  })
  it('never calls a box height a PR', () => {
    const h = { ...legPress, id: 'box', loadMode: 'height_cm' as const }
    const a = toSession(mkSession('2026-10-03', [[50, 5]], undefined, { ex: h }))
    const b = toSession(mkSession('2026-10-10', [[55, 5]], undefined, { ex: h }))
    expect(isPr(h, [a, b], mkSession('2026-10-17', [[60, 5]], undefined, { ex: h }).rows)).toBe(false)
  })
})

describe('lightWeekDue, lightWeekRunning, daysLeft', () => {
  it('is due 42 days after the first workout with no light week yet, and not before', () => {
    expect(lightWeekDue(mkData([flat('2026-09-20'), flat('2026-10-20')], [legPress]), NOW)).toBe('time')
    expect(lightWeekDue(mkData([flat('2026-09-21'), flat('2026-10-20')], [legPress]), NOW)).toBeNull()
  })
  it('measures time from the end of the last light week once there has been one', () => {
    const lw = { startedAt: '2026-09-22T00:00:00+08:00', endsAt: '2026-09-29T00:00:00+08:00' }
    expect(lightWeekDue(mkData([flat('2026-08-01'), flat('2026-10-20')], [legPress], { lightWeeks: [lw] }), NOW)).toBeNull() // 33 days
    const old = { startedAt: '2026-09-15T00:00:00+08:00', endsAt: '2026-09-20T00:00:00+08:00' }
    expect(lightWeekDue(mkData([flat('2026-08-01'), flat('2026-10-20')], [legPress], { lightWeeks: [old] }), NOW)).toBe('time') // 42 days
  })
  it('is null with no workouts', () => {
    expect(lightWeekDue(mkData([], []), NOW)).toBeNull()
  })
  const twoStalls = () => {
    const db = (d: string) => mkSession(d, [[20, 10], [20, 10], [20, 8]], 8, { ex: dbBench })
    return mkData(
      [flat('2026-10-10'), flat('2026-10-17'), flat('2026-10-24'), db('2026-10-11'), db('2026-10-18'), db('2026-10-25')],
      [legPress, dbBench],
    )
  }
  it('is due with two stalled lifts', () => {
    expect(lightWeekDue(twoStalls(), NOW)).toBe('stalls')
  })
  it('is not due with one stalled lift', () => {
    expect(lightWeekDue(mkData([flat('2026-10-10'), flat('2026-10-17'), flat('2026-10-24')], [legPress]), NOW)).toBeNull()
  })
  it('ignores stalled lifts last trained more than 28 days ago', () => {
    const db = (d: string) => mkSession(d, [[20, 10], [20, 10], [20, 8]], 8, { ex: dbBench })
    const data = mkData(
      [flat('2026-10-10'), flat('2026-10-17'), flat('2026-10-24'), db('2026-09-06'), db('2026-09-13'), db('2026-09-20')],
      [legPress, dbBench],
    )
    // db latest 2026-09-20 is 42 days back, so only one lift counts as stalled and the time trigger answers
    expect(lightWeekDue(data, NOW)).toBe('time')
  })
  it('is due after two drops of more than five percent in four sessions', () => {
    const s = (w: number, d: string) => S([[w, 12], [w, 12], [w, 12]], 8, d)
    const data = mkData(
      [s(100, '2026-10-03'), s(100, '2026-10-10'), s(94, '2026-10-17'), s(100, '2026-10-24'), s(94, '2026-10-31')],
      [legPress],
    )
    expect(lightWeekDue(data, NOW)).toBe('drops')
    // one drop is not enough, and a drop of four percent does not count
    const one = mkData([s(100, '2026-10-10'), s(100, '2026-10-17'), s(94, '2026-10-24'), s(100, '2026-10-31')], [legPress])
    expect(lightWeekDue(one, NOW)).toBeNull()
    const exact = mkData([s(100, '2026-10-03'), s(96, '2026-10-10'), s(100, '2026-10-17'), s(96, '2026-10-24')], [legPress])
    expect(lightWeekDue(exact, NOW)).toBeNull()
  })
  it('ignores drops on lifts last trained more than 28 days ago', () => {
    const s = (w: number, d: string) => S([[w, 12], [w, 12], [w, 12]], 8, d)
    const old = mkData(
      [s(100, '2026-09-01'), s(100, '2026-09-08'), s(94, '2026-09-15'), s(100, '2026-09-22'), s(94, '2026-09-29')],
      [legPress],
    )
    expect(lightWeekDue(old, NOW)).toBe('time') // latest session 33 days back; only the time trigger is left
    expect(lightWeekDue(old, '2026-10-20T10:00:00+08:00')).toBe('drops') // 21 days back
  })
  it('does not re-trigger stalls or drops from before a light week when it ends', () => {
    const ends = '2026-11-08T00:00:00+08:00'
    const lw = { startedAt: '2026-11-01T00:00:00+08:00', endsAt: ends }
    const stalled = twoStalls()
    expect(lightWeekDue(stalled, '2026-11-01T00:00:00+08:00')).toBe('stalls')
    expect(lightWeekDue({ ...stalled, coach: { lightWeeks: [lw] } }, ends)).toBeNull()
    expect(coachRows({ ...stalled, coach: { lightWeeks: [lw] } }, ends)).toEqual([])
    const s = (w: number, d: string) => S([[w, 12], [w, 12], [w, 12]], 8, d)
    const drops = mkData(
      [s(100, '2026-10-03'), s(100, '2026-10-10'), s(94, '2026-10-17'), s(100, '2026-10-24'), s(94, '2026-10-31')],
      [legPress],
    )
    expect(lightWeekDue(drops, ends)).toBe('drops')
    expect(lightWeekDue({ ...drops, coach: { lightWeeks: [lw] } }, ends)).toBeNull()
  })
  it('checks stalls before drops before time', () => {
    const both = twoStalls()
    both.workouts.push(flat('2026-08-01').workout) // an old first workout makes time due as well
    both.sets.push(...flat('2026-08-01').rows)
    expect(lightWeekDue(both, NOW)).toBe('stalls')
  })
  it('is quiet while running or snoozed', () => {
    const data = mkData([flat('2026-09-01'), flat('2026-10-20')], [legPress], {
      lightWeeks: [{ startedAt: '2026-10-30T09:00:00+08:00', endsAt: '2026-11-06T09:00:00+08:00' }],
    })
    expect(lightWeekDue(data, NOW)).toBeNull()
    expect(lightWeekRunning(data.coach, NOW)).toEqual(data.coach.lightWeeks[0])
    expect(daysLeft(data.coach.lightWeeks[0], NOW)).toBe(5)
    expect(daysLeft(data.coach.lightWeeks[0], '2026-11-06T09:00:00+08:00')).toBe(0)
    expect(daysLeft(data.coach.lightWeeks[0], '2026-11-08T09:00:00+08:00')).toBe(0)
    expect(lightWeekRunning(data.coach, '2026-11-06T09:00:00+08:00')).toBeNull() // half open
    expect(lightWeekRunning(data.coach, '2026-10-30T08:59:00+08:00')).toBeNull()
    const snoozed = { ...data, coach: { lightWeeks: [], lightWeekSnoozedUntil: '2026-11-03T00:00:00+08:00' } }
    expect(lightWeekDue(snoozed, NOW)).toBeNull()
    expect(lightWeekDue({ ...snoozed, coach: { lightWeeks: [], lightWeekSnoozedUntil: '2026-10-31T00:00:00+08:00' } }, NOW)).toBe('time')
  })
})

describe('coachRows and history', () => {
  // Leg Press at eq1: 95 on 19 Sep, then 100 × 12 flat for three sessions (a stall of 3);
  // Dumbbell Bench: 25 × 12, then 24 -> 25 -> 26.5 this week (a PR); first workout is 43 days old.
  const build = () => {
    const db = (d: string, w: number) => mkSession(d, [[w, 12], [w, 12]], 8, { ex: dbBench })
    return mkData(
      [
        S([[95, 12], [95, 12], [95, 10]], 8, '2026-09-19'),
        flat('2026-10-10'),
        flat('2026-10-17'),
        flat('2026-10-24'),
        db('2026-10-10', 24),
        db('2026-10-17', 25),
        db('2026-10-28', 26.5),
      ],
      [legPress, dbBench],
    )
  }
  it('orders light, stalls, PRs and writes the titles', () => {
    const rows = coachRows(build(), NOW)
    expect(rows.map((r) => r.kind)).toEqual(['light-due', 'stall', 'pr'])
    expect(rows[0]).toEqual({ kind: 'light-due', reason: 'time' })
    expect(rows[1]).toMatchObject({
      key: 'eq:eq1',
      exerciseId: 'm-leg-press',
      title: 'Leg Press · Tampines West',
      detail: 'stalled: 3 sessions at 100 × 12',
    })
    expect(rows[2]).toMatchObject({
      key: 'ex:db-bench',
      exerciseId: 'db-bench',
      title: 'Dumbbell Bench Press',
      detail: 'e1RM 37 kg, up from 35',
      date: '2026-10-28',
    })
  })
  it('shows a running light week first, with the days left, no stall rows and no PR from light sessions', () => {
    const data = build()
    data.coach = { lightWeeks: [{ startedAt: '2026-10-27T00:00:00+08:00', endsAt: '2026-11-06T09:00:00+08:00' }] }
    const rows = coachRows(data, NOW)
    expect(rows[0]).toEqual({ kind: 'light-running', daysLeft: 5 })
    // the 28 Oct bench session is light, so no PR; the light week restarts the Leg Press stall
    expect(rows.map((r) => r.kind)).toEqual(['light-running'])
  })
  it('shows no row for a box jump however flat it is', () => {
    const jump = (d: string) => mkSession(d, [[50, 5], [50, 5], [50, 5]], 8, { ex: boxJump })
    const data = mkData([jump('2026-10-10'), jump('2026-10-17'), jump('2026-10-24')], [boxJump])
    expect(coachRows(data, '2026-10-28T10:00:00+08:00')).toEqual([])
    expect(history(data, boxJump, 'ex:plyo-box-jump').stall).toBeNull()
  })
  it('forgets stalls older than 28 days', () => {
    const data = mkData([flat('2026-09-19'), flat('2026-09-26'), flat('2026-10-03')], [legPress])
    expect(coachRows(data, NOW).filter((r) => r.kind === 'stall')).toHaveLength(0) // latest is 29 days back
    expect(coachRows(data, '2026-10-31T10:00:00+08:00').filter((r) => r.kind === 'stall')).toHaveLength(1) // 28 days back
  })
  it('only lists PRs from the current calendar week, newest first, one per lift', () => {
    const db = (d: string, w: number) => mkSession(d, [[w, 12], [w, 12]], 8, { ex: dbBench })
    const data = mkData(
      [db('2026-10-10', 24), db('2026-10-17', 25), db('2026-10-27', 26.5), db('2026-10-30', 28), flat('2026-10-10'), flat('2026-10-17'), S([[105, 12], [105, 12]], 8, '2026-10-29')],
      [legPress, dbBench],
    )
    const prs = coachRows(data, NOW).filter((r) => r.kind === 'pr')
    // the bench PRs on 27 and 30 Oct: one row, the newer
    expect(prs.map((r) => (r as { date: string }).date)).toEqual(['2026-10-30', '2026-10-29'])
    expect(prs.map((r) => (r as { key: string }).key)).toEqual(['ex:db-bench', 'eq:eq1'])
    expect(prs[0]).toMatchObject({ detail: 'e1RM 39 kg, up from 37' })
    expect(coachRows(data, '2026-11-09T10:00:00+08:00').filter((r) => r.kind === 'pr')).toHaveLength(0)
  })
  it('words PRs on lifts with no estimate as a best set', () => {
    const a = mkSession('2026-10-03', [[0, 12]], undefined, { ex: backExtension })
    const b = mkSession('2026-10-10', [[0, 14]], undefined, { ex: backExtension })
    const c = mkSession('2026-10-28', [[10, 14]], undefined, { ex: backExtension })
    const rows = coachRows(mkData([a, b, c], [backExtension]), NOW).filter((r) => r.kind === 'pr')
    expect(rows[0]).toMatchObject({ title: 'Back Extension', detail: 'best set 14 reps at BW+10' })
    const t = (d: string, n: number, w: number) => mkSession(d, [[w, n]], undefined, { durationSec: true, ex: carry })
    const timed = coachRows(mkData([t('2026-10-03', 40, 24), t('2026-10-10', 45, 24), t('2026-10-28', 60, 24)], [carry]), NOW)
    expect(timed.find((r) => r.kind === 'pr')).toMatchObject({ detail: 'best set 60s at 24' })
  })
  it('titles equipment keys with the short outlet and others with the exercise name', () => {
    const data = build()
    expect(keyTitle(data, legPress, 'eq:eq1')).toBe('Leg Press · Tampines West')
    expect(keyTitle(data, dbBench, 'ex:db-bench')).toBe('Dumbbell Bench Press')
    expect(keyTitle(data, legPress, 'eq:missing')).toBe('Leg Press')
  })
  it('gives twelve points oldest first with the best marked', () => {
    const data = build()
    const early = [S([[85, 12], [85, 12]], 8, '2026-09-05'), S([[90, 12], [90, 12]], 8, '2026-09-12')]
    data.workouts.push(...early.map((e) => e.workout))
    data.sets.push(...early.flatMap((e) => e.rows))
    const h = history(data, legPress, 'eq:eq1')
    expect(h.points.length).toBeLessThanOrEqual(12)
    expect(h.points).toHaveLength(6)
    expect(h.points[h.points.length - 1].session.workout.startedAt > h.points[0].session.workout.startedAt).toBe(true)
    expect(h.best!.pr).toBe(true)
    expect(h.best!.session.workout.startedAt.startsWith('2026-10-10')).toBe(true) // first of the tied best sessions
    expect(h.points.map((p) => p.pr)).toEqual([false, false, true, true, false, false])
    expect(h.stall).toEqual({ sessions: 3, w: 100, reps: 12 })
  })
  it('limits to the last points, judges PRs against all earlier sessions and never marks light ones', () => {
    const s = (w: number, d: string) => S([[w, 12], [w, 12]], 8, d)
    const sessions = [s(100, '2026-09-01'), s(101, '2026-09-08'), s(102, '2026-09-15'), s(103, '2026-09-22'), s(104, '2026-09-29')]
    const data = mkData(sessions, [legPress], { lightWeeks: [{ startedAt: '2026-09-29T00:00:00+08:00', endsAt: '2026-10-06T00:00:00+08:00' }] })
    const h = history(data, legPress, 'eq:eq1', 2)
    expect(h.points).toHaveLength(2)
    expect(h.points[0].pr).toBe(true) // 103 beats 100, 101, 102 outside the window
    expect(h.points[1].pr).toBe(false) // light
    expect(h.points[1].session.light).toBe(true)
    expect(h.points[1].e1rm).toEqual({ kg: 104 * (1 + 12 / 30), rough: true })
    expect(h.best!.session.workout.startedAt.startsWith('2026-09-29')).toBe(true) // light sessions can still be the best score shown
  })
  it('has no best for lifts without a score and nothing for an unknown key', () => {
    const box = { ...legPress, id: 'box', loadMode: 'height_cm' as const, equipmentType: 'bodyweight' as const }
    const data = mkData([mkSession('2026-10-10', [[50, 5]], undefined, { ex: box })], [box])
    const h = history(data, box, 'ex:box')
    expect(h.points).toHaveLength(1)
    expect(h.best).toBeNull()
    expect(history(data, box, 'ex:none')).toEqual({ points: [], best: null, stall: null })
  })
})
