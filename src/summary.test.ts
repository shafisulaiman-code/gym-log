import { describe, it, expect } from 'vitest'
import { volumeKg, summarize } from './summary'
import type { Exercise, SetRow } from './types'
import { legPress } from './history.test'

const base: Omit<Exercise, 'id' | 'name' | 'equipmentType' | 'loadMode'> = {
  category: 'x',
  primaryMuscles: [],
  pattern: 'x',
  unilateral: false,
  defaultIncrementKg: 2.5,
  repRange: [8, 12],
  backCaution: false,
  kneeCaution: false,
  gated: false,
  note: '',
  cues: [],
  visualId: null,
  visualFrames: 0,
}
const dbBench: Exercise = { ...base, id: 'db-bench', name: 'Dumbbell Bench Press', equipmentType: 'dumbbell', loadMode: 'per_hand' }
const pushUp: Exercise = { ...base, id: 'bw-push-up', name: 'Push-up', equipmentType: 'bodyweight', loadMode: 'bodyweight_plus' }
const plank: Exercise = { ...base, id: 'core-plank', name: 'Plank', equipmentType: 'bodyweight', loadMode: 'timed' }
const latPull: Exercise = { ...base, id: 'm-lat-pulldown', name: 'Lat Pulldown', equipmentType: 'machine_selectorised', loadMode: 'total' }
const ex = Object.fromEntries([legPress, dbBench, pushUp, plank, latPull].map((e) => [e.id, e]))

let n = 0
function row(exerciseId: string, patch: Partial<SetRow>): SetRow {
  n += 1
  return { id: `s${n}`, workoutId: 'w', exerciseId, setIndex: 0, isWarmup: false, seq: n, ...patch }
}
const done = (exerciseId: string, patch: Partial<SetRow>) =>
  row(exerciseId, { completedAt: '2026-10-31T10:00:00+08:00', ...patch })
const open = (exerciseId: string, patch: Partial<SetRow>) => row(exerciseId, patch)
const ghostRow = row(legPress.id, { ghost: true, weightKg: 100, reps: 12 })

describe('volumeKg', () => {
  it('sums working sets, doubles per-hand, ignores timed, warm-ups and bodyweight zero', () => {
    const rows = [
      done(legPress.id, { weightKg: 100, reps: 10 }),
      done(legPress.id, { weightKg: 60, reps: 10, isWarmup: true }),
      done(dbBench.id, { weightKg: 26, reps: 10 }),
      done(plank.id, { durationSec: 45 }),
      done(pushUp.id, { weightKg: 0, reps: 15 }),
    ]
    expect(volumeKg(rows, ex)).toBe(1000 + 520)
  })

  it('skips rows missing weight or reps, and unticked rows', () => {
    expect(volumeKg([done(legPress.id, { reps: 10 })], ex)).toBe(0)
    expect(volumeKg([open(legPress.id, { weightKg: 100, reps: 10 })], ex)).toBe(0)
  })

  it('counts added kg on bodyweight-plus', () => {
    expect(volumeKg([done(pushUp.id, { weightKg: 10, reps: 10 })], ex)).toBe(100)
  })
})

describe('summarize', () => {
  it('reports nothing logged when only ghost rows exist', () => {
    const s = summarize([ghostRow], ex)
    expect(s.nothingLogged).toBe(true)
    expect(s.done).toBe(0)
    expect(s.untickedReal.count).toBe(0)
    expect(s.lines).toEqual([])
  })

  it('names the exercise when all unticked rows are on one exercise', () => {
    const s = summarize(
      [done(legPress.id, { weightKg: 100, reps: 12 }), open(latPull.id, { weightKg: 55, reps: 12 })],
      ex,
    )
    expect(s.untickedReal).toEqual({ count: 1, exerciseName: 'Lat Pulldown' })
    expect(s.lines).toEqual([{ name: 'Leg Press', text: '100 kg × 12' }])
    expect(s.nothingLogged).toBe(false)
  })

  it('leaves exerciseName out when unticked rows span exercises', () => {
    const s = summarize(
      [open(legPress.id, { weightKg: 100, reps: 12 }), open(latPull.id, { weightKg: 55, reps: 12 })],
      ex,
    )
    expect(s.untickedReal).toEqual({ count: 2 })
  })

  it('formats timed exercises in seconds', () => {
    const s = summarize([done(plank.id, { durationSec: 45 }), done(plank.id, { durationSec: 40 })], ex)
    expect(s.lines[0]).toEqual({ name: 'Plank', text: '45s, 40s' })
  })
})
