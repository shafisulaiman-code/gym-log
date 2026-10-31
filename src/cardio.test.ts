import { describe, it, expect } from 'vitest'
import { timeline, applyShared, isOverridden, prefillFrom } from './cardio'

describe('timeline', () => {
  it('splits the remainder into warm-up and cool-down', () => {
    const t = timeline(38, 4, 3, 4)
    expect(t.warmupMin).toBe(6.5)
    expect(t.coolMin).toBe(6.5)
    expect(t.segments.map((s) => s.kind)).toEqual([
      'warmup', 'work', 'rest', 'work', 'rest', 'work', 'rest', 'work', 'cool',
    ])
    expect(t.segments[1].min).toBe(4)
    expect(t.segments[2].min).toBe(3)
  })

  it('clamps at zero when the duration is too short', () => {
    const t = timeline(20, 4, 3, 4)
    expect(t.warmupMin).toBe(0)
    expect(t.coolMin).toBe(0)
  })
})

describe('applyShared', () => {
  it('rewrites inherited rows and keeps overrides', () => {
    const ivs = [{ workMin: 4, speedKph: 6.2 }, { workMin: 4, speedKph: 6.5 }, { workMin: 4, speedKph: 6.2 }]
    expect(applyShared(ivs, 'speedKph', 6.2, 6.4).map((i) => i.speedKph)).toEqual([6.4, 6.5, 6.4])
  })

  it('fills rows that had no value when the shared value was undefined', () => {
    const ivs = [{ workMin: 4 }, { workMin: 4, inclinePct: 12 }]
    expect(applyShared(ivs, 'inclinePct', undefined, 10).map((i) => i.inclinePct)).toEqual([10, 12])
  })
})

describe('isOverridden', () => {
  it('is true only when the row differs from the shared value', () => {
    expect(isOverridden({ workMin: 4, speedKph: 6.5 }, 'speedKph', 6.2)).toBe(true)
    expect(isOverridden({ workMin: 4, speedKph: 6.2 }, 'speedKph', 6.2)).toBe(false)
    expect(isOverridden({ workMin: 4 }, 'speedKph', 6.2)).toBe(false)
  })
})

describe('prefillFrom', () => {
  it('keeps the plan and drops the measurements', () => {
    const f = prefillFrom({
      id: 'c',
      workoutId: 'w',
      modality: 'treadmill_4x4',
      durationMin: 38,
      speedKph: 6.2,
      inclinePct: 10,
      avgHr: 150,
      maxHr: 170,
      rpe: 8,
      notes: 'x',
      intervals: [{ workMin: 4, speedKph: 6.5, inclinePct: 10, peakHr: 168 }],
    })
    expect(f).toEqual({
      modality: 'treadmill_4x4',
      durationMin: 38,
      speedKph: 6.2,
      inclinePct: 10,
      intervals: [{ workMin: 4, speedKph: 6.5, inclinePct: 10 }],
    })
  })

  it('leaves intervals out for modalities without them', () => {
    const f = prefillFrom({ id: 'c', workoutId: 'w', modality: 'bike', durationMin: 30, avgHr: 140 })
    expect(f).toEqual({ modality: 'bike', durationMin: 30 })
  })
})
