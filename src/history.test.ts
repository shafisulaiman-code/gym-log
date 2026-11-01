import { describe, it, expect } from 'vitest'
import { countSets, prefillRows, formatLast, formatSession, loadUnit, knownRows, ratingOf, pickLastSession, undoPlan } from './history'
import type { Equipment, Exercise, LightWeek, SetRow } from './types'

export const legPress: Exercise = {
  id: 'm-leg-press',
  name: 'Leg Press',
  category: 'Machine',
  primaryMuscles: ['quads'],
  pattern: 'squat',
  equipmentType: 'machine_plate',
  unilateral: false,
  loadMode: 'total',
  defaultIncrementKg: 2.5,
  repRange: [10, 15],
  backCaution: true,
  kneeCaution: true,
  gated: false,
  note: '',
  cues: [],
  visualId: null,
  visualFrames: 0,
}

export const eq: Equipment = {
  id: 'eq1',
  exerciseId: 'm-leg-press',
  outletId: 'o1',
  label: 'Leg Press @ TW',
  stackStepKg: 2.5,
}

export const last: SetRow[] = [
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
  it('still formats the working sets only', () => {
    expect(formatLast(legPress, last)).toBe('Last: 100 kg × 12')
  })
})

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

export const boxJump: Exercise = {
  ...legPress,
  id: 'plyo-box-jump',
  name: 'Box Jump',
  category: 'Plyo',
  primaryMuscles: ['quads', 'glutes'],
  equipmentType: 'bodyweight',
  loadMode: 'height_cm',
  defaultIncrementKg: 5,
  repRange: [3, 6],
  backCaution: false,
}

const heightSet = (patch: Partial<SetRow>): SetRow => ({
  id: `h${Math.random()}`,
  workoutId: 'w1',
  exerciseId: boxJump.id,
  setIndex: 0,
  isWarmup: false,
  seq: 1,
  completedAt: '2026-10-31T10:00:00+08:00',
  ...patch,
})

describe('height_cm', () => {
  it('prefills a box jump at 50 cm × 10 when there is no history', () => {
    const [row] = prefillRows(boxJump, undefined, 'w1', [])
    expect(row.weightKg).toBe(50)
    expect(row.reps).toBe(10)
  })
  it('formats height sets in cm', () => {
    const rows = [heightSet({ weightKg: 60, reps: 5 }), heightSet({ weightKg: 60, reps: 4 })]
    expect(formatLast(boxJump, rows)).toBe('Last: 60 cm × 5, 4')
  })
  it('loadUnit is cm only for height_cm', () => {
    expect(loadUnit(boxJump)).toBe('cm')
    expect(loadUnit(legPress)).toBe('kg')
  })
})

const slam: Exercise = {
  ...boxJump,
  id: 'plyo-med-ball-slam',
  name: 'Medicine Ball Slam',
  primaryMuscles: ['core', 'lats'],
  loadMode: 'total',
  defaultIncrementKg: 1,
  repRange: [8, 12],
}

describe('prefill for a hand-held load with no stack', () => {
  it('gives the medicine ball slam a starting weight so the stepper and the saved row agree', () => {
    const [row] = prefillRows(slam, undefined, 'w1', [])
    expect(row.weightKg).toBe(6)
    expect(row.reps).toBe(10)
  })
})

describe('knownRows', () => {
  it('drops rows whose exercise is no longer in the library and keeps the rest', () => {
    const keep = heightSet({ exerciseId: boxJump.id })
    const orphan = heightSet({ exerciseId: 'm-pec-fly-rear-delt' })
    expect(knownRows([orphan, keep], { [boxJump.id]: boxJump })).toEqual([keep])
  })
})

describe('ratingOf and the Last suffix', () => {
  const t = (s: number) => `2026-10-31T10:0${s}:00+08:00`
  it('returns nothing when no row is rated', () => {
    expect(ratingOf(last)).toEqual({})
    expect(formatLast(legPress, last)).toBe('Last: 100 kg × 12')
  })
  it('takes the latest rated completed row', () => {
    const rows: SetRow[] = [
      { ...last[1], id: 'x', completedAt: t(1), rpe: 7 },
      { ...last[1], id: 'y', completedAt: t(2), rpe: 8, painFlag: 'back' },
      { ...last[1], id: 'z', completedAt: t(3) },
    ]
    expect(ratingOf(rows)).toEqual({ rpe: 8, pain: 'back' })
    expect(formatLast(legPress, rows)).toBe('Last: 100 kg × 12, 12, 12 · 8/10 · back')
  })
  it('shows pain without effort and effort without pain', () => {
    expect(formatLast(legPress, [{ ...last[1], painFlag: 'knee' }])).toBe('Last: 100 kg × 12 · knee')
    expect(formatLast(legPress, [{ ...last[1], rpe: 9 }])).toBe('Last: 100 kg × 12 · 9/10')
  })
  it('ignores a rating on an unticked row', () => {
    expect(ratingOf([{ ...last[1], completedAt: undefined, rpe: 9 }])).toEqual({})
  })
})

const dbBench: Exercise = { ...legPress, id: 'db-bench', name: 'Dumbbell Bench Press', equipmentType: 'dumbbell', loadMode: 'per_hand' }
const pushUp: Exercise = { ...legPress, id: 'bw-push-up', name: 'Push-up', equipmentType: 'bodyweight', loadMode: 'bodyweight_plus' }
const plank: Exercise = { ...legPress, id: 'core-plank', name: 'Plank', equipmentType: 'bodyweight', loadMode: 'timed' }
const carry: Exercise = { ...legPress, id: 'kb-carry', name: 'Kettlebell Carry', equipmentType: 'kettlebell', loadMode: 'timed' }

describe('formatSession', () => {
  const w = (weightKg: number, reps: number): SetRow => ({ ...last[1], id: `s${weightKg}${reps}`, weightKg, reps })
  it('writes loads without units and leaves warm-ups out', () => {
    expect(formatSession(legPress, [last[0], w(100, 12), w(100, 10)])).toBe('100 × 12, 10')
    expect(formatSession(legPress, [w(100, 12), w(105, 10)])).toBe('100×12, 105×10')
  })
  it('marks per hand, bodyweight, height and timed loads', () => {
    expect(formatSession(dbBench, [{ ...w(14, 10), exerciseId: dbBench.id }])).toBe('14 ph × 10')
    expect(formatSession(pushUp, [{ ...w(0, 15), exerciseId: pushUp.id }])).toBe('BW × 15')
    expect(formatSession(pushUp, [{ ...w(10, 12), exerciseId: pushUp.id }])).toBe('BW+10 × 12')
    expect(formatSession(boxJump, [{ ...w(60, 5), exerciseId: boxJump.id }])).toBe('60 cm × 5')
    expect(formatSession(plank, [{ ...last[1], exerciseId: plank.id, weightKg: undefined, reps: undefined, durationSec: 45 }])).toBe('45s')
    expect(formatSession(carry, [{ ...last[1], exerciseId: carry.id, weightKg: 24, reps: undefined, durationSec: 45 }, { ...last[1], exerciseId: carry.id, weightKg: 24, reps: undefined, durationSec: 45 }])).toBe('24 × 45s, 45s')
  })
  it('keeps the load markers when weights differ', () => {
    expect(formatSession(dbBench, [{ ...w(14, 10), exerciseId: dbBench.id }, { ...w(16, 8), exerciseId: dbBench.id }])).toBe('14 ph×10, 16 ph×8')
    expect(formatSession(pushUp, [{ ...w(0, 15), exerciseId: pushUp.id }, { ...w(10, 12), exerciseId: pushUp.id }])).toBe('BW×15, BW+10×12')
    expect(formatSession(boxJump, [{ ...w(50, 5), exerciseId: boxJump.id }, { ...w(60, 5), exerciseId: boxJump.id }])).toBe('50 cm×5, 60 cm×5')
  })
  it('treats no weight and 0 as the same bodyweight', () => {
    expect(formatSession(pushUp, [{ ...w(0, 15), exerciseId: pushUp.id, weightKg: undefined }, { ...w(0, 12), exerciseId: pushUp.id }])).toBe('BW × 15, 12')
  })
  it('is empty with no working sets', () => {
    expect(formatSession(legPress, [last[0]])).toBe('')
  })
})

describe('pickLastSession', () => {
  const lw: LightWeek[] = [{ startedAt: '2026-10-26T00:00:00+08:00', endsAt: '2026-11-02T00:00:00+08:00' }]
  const row = (workoutId: string, completedAt: string, weightKg: number): SetRow => ({
    id: workoutId + completedAt,
    workoutId,
    exerciseId: 'm-leg-press',
    setIndex: 0,
    isWarmup: false,
    weightKg,
    reps: 10,
    seq: 1,
    completedAt,
  })
  // Each test workout starts at the date of its rows, 09:00.
  const startedAtOf = (rows: SetRow[]) => (id: string) => {
    const r = rows.find((x) => x.workoutId === id)
    return r ? `${r.completedAt!.slice(0, 10)}T09:00:00+08:00` : undefined
  }
  it('returns the latest session before the light week', () => {
    const rows = [row('a', '2026-10-20T10:00:00+08:00', 100), row('b', '2026-10-28T10:00:00+08:00', 90)]
    expect(pickLastSession(rows, lw, startedAtOf(rows)).map((r) => r.weightKg)).toEqual([100])
    expect(pickLastSession(rows, [], startedAtOf(rows)).map((r) => r.weightKg)).toEqual([90])
  })
  it('falls back to the light session when nothing earlier exists', () => {
    const rows = [row('b', '2026-10-28T10:00:00+08:00', 90)]
    expect(pickLastSession(rows, lw, startedAtOf(rows)).map((r) => r.weightKg)).toEqual([90])
  })
  it('returns nothing when there are no rows', () => {
    expect(pickLastSession([], lw, () => undefined)).toEqual([])
  })
  it('returns all rows of the picked workout sorted by seq', () => {
    const rows = [
      { ...row('a', '2026-10-20T10:05:00+08:00', 100), seq: 2 },
      { ...row('a', '2026-10-20T10:00:00+08:00', 95), seq: 1 },
      row('b', '2026-10-28T10:00:00+08:00', 90),
    ]
    expect(pickLastSession(rows, lw, startedAtOf(rows)).map((r) => r.weightKg)).toEqual([95, 100])
  })
  it('judges a workout by its startedAt, falling back to its latest completedAt when unknown', () => {
    // b started before the light week ended but was ticked after it: light by startedAt
    const rows = [row('a', '2026-10-20T10:00:00+08:00', 100), row('b', '2026-11-02T00:05:00+08:00', 90)]
    const started = (id: string) => (id === 'a' ? '2026-10-20T09:00:00+08:00' : '2026-11-01T23:58:00+08:00')
    expect(pickLastSession(rows, lw, started).map((r) => r.weightKg)).toEqual([100])
    expect(pickLastSession(rows, lw, () => undefined).map((r) => r.weightKg)).toEqual([90])
  })
})

describe('undoPlan', () => {
  const row = (id: string, seq: number, over: Partial<SetRow>): SetRow => ({
    id, workoutId: 'w1', exerciseId: 'm-leg-press', equipmentId: 'eq1', setIndex: 0, isWarmup: false, weightKg: 100, reps: 12, seq, ...over,
  })
  const prefill = [
    row('pw', 90, { isWarmup: true, ghost: true, weightKg: 60 }),
    row('p1', 91, { ghost: true }),
    row('p2', 92, { ghost: true }),
    row('p3', 93, { ghost: true }),
  ]

  it('swaps the ghost working rows back and keeps the warm-up ghost', () => {
    const mine = [
      row('w', 1, { isWarmup: true, ghost: true, weightKg: 60 }),
      row('a', 2, { ghost: true, coach: 'up', weightKg: 102.5, reps: 10 }),
      row('b', 3, { ghost: true, coach: 'up', weightKg: 102.5, reps: 10 }),
      row('c', 4, { ghost: true, coach: 'up', weightKg: 102.5, reps: 10 }),
    ]
    const { remove, add } = undoPlan(mine, prefill)
    expect(remove.map((r) => r.id)).toEqual(['a', 'b', 'c'])
    expect(add.map((r) => [r.isWarmup, r.seq, r.weightKg, r.coach])).toEqual([
      [false, 2, 100, undefined],
      [false, 3, 100, undefined],
      [false, 4, 100, undefined],
    ])
  })

  it('counts a hand-edited working row and never touches warm-ups', () => {
    const mine = [
      row('w', 1, { isWarmup: true, ghost: true, weightKg: 60 }),
      row('a', 2, { coach: 'up', weightKg: 105, reps: 9 }), // edited by hand: real
      row('b', 3, { ghost: true, coach: 'up' }),
      row('c', 4, { ghost: true, coach: 'up' }),
    ]
    const { remove, add } = undoPlan(mine, prefill)
    expect(remove.map((r) => r.id)).toEqual(['b', 'c'])
    expect(add).toHaveLength(2)
    expect(add.every((r) => !r.isWarmup && r.ghost === true)).toBe(true)
    expect(add.map((r) => r.seq)).toEqual([3, 4])
  })

  it('numbers extra restored rows after the last row', () => {
    const mine = [row('a', 5, { ghost: true, coach: 'light' }), row('b', 6, { ghost: true, coach: 'light' })]
    const { add } = undoPlan(mine, prefill)
    expect(add.map((r) => r.seq)).toEqual([5, 6, 7])
  })
})
