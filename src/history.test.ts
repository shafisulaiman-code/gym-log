import { describe, it, expect } from 'vitest'
import { countSets, prefillRows, formatLast, loadUnit, knownRows } from './history'
import type { Equipment, Exercise, SetRow } from './types'

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
