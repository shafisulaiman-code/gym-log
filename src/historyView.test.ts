import { describe, it, expect } from 'vitest'
import type { HistoryPoint } from './coach'
import { axisText, countWord, historyStats, shortDay, sparkLayout } from './historyView'
import { boxJump, legPress } from './history.test'
import type { Exercise, SetRow, Workout } from './types'

const back: Exercise = { ...legPress, id: 'ext', name: 'Back Extension', equipmentType: 'bodyweight', loadMode: 'bodyweight_plus' }

function row(w: number, n: number, i = 0): SetRow {
  return { id: `r${i}`, workoutId: 'w', exerciseId: 'x', setIndex: i, isWarmup: false, weightKg: w, reps: n, seq: i, completedAt: '2026-10-01T18:00:00+08:00' }
}

// kg: the estimate, or null for a point without one.
function point(date: string, kg: number | null, rough = false, rows: SetRow[] = [row(100, 12)]): HistoryPoint {
  const workout = { id: date, startedAt: `${date}T18:00:00+08:00`, outletId: 'o1', type: 'strength' } as Workout
  return { session: { workout, rows, light: false }, e1rm: kg === null ? null : { kg, rough }, pr: false }
}

describe('sparkLayout', () => {
  it('spreads x over 10 to 370 and puts a single point in the middle', () => {
    expect(sparkLayout([100, 110]).map((p) => p.x)).toEqual([10, 370])
    expect(sparkLayout([1, 2, 3]).map((p) => p.x)).toEqual([10, 190, 370])
    expect(sparkLayout([120])).toEqual([{ x: 190, y: 60 }])
    expect(sparkLayout([])).toEqual([])
  })
  it('scales y from min minus pad to max plus pad, higher estimates higher up', () => {
    // range 20, pad 3: axis 97 to 123
    const [lo, hi] = sparkLayout([100, 120])
    expect(lo.y).toBeGreaterThan(hi.y)
    expect(lo.y).toBeCloseTo(108 - (3 / 26) * 96, 6)
    expect(hi.y).toBeCloseTo(108 - (23 / 26) * 96, 6)
  })
  it('pads by at least one kg so a flat line stays off the edge', () => {
    const ys = sparkLayout([100, 100, 100]).map((p) => p.y)
    expect(ys).toEqual([60, 60, 60])
    const [a, b] = sparkLayout([100, 100.5]) // pad 1, not 0.075
    expect(a.y).toBeCloseTo(108 - (1 / 2.5) * 96, 6)
    expect(b.y).toBeCloseTo(108 - (1.5 / 2.5) * 96, 6)
  })
})

describe('words and dates', () => {
  it('counts in words from one to twelve, then digits', () => {
    expect(countWord(1)).toBe('one')
    expect(countWord(12)).toBe('twelve')
    expect(countWord(13)).toBe('13')
  })
  it('drops the weekday', () => {
    expect(shortDay('2026-10-17T18:00:00+08:00')).toBe('17 Oct')
  })
})

describe('axisText', () => {
  it('shows the first and last dates around the count', () => {
    const pts = ['2026-09-12', '2026-10-01', '2026-10-31'].map((d) => point(d, 100))
    expect(axisText(pts)).toEqual(['12 Sep', 'three sessions', '31 Oct'])
    expect(axisText(pts.slice(0, 2))).toEqual(['12 Sep', 'two sessions', '1 Oct'])
  })
  it('reads one session as a single phrase and twelve as a word', () => {
    expect(axisText([point('2026-10-31', 100)])).toEqual(['31 Oct · one session'])
    const twelve = Array.from({ length: 12 }, (_, i) => point(`2026-10-${String(i + 10).padStart(2, '0')}`, 100))
    expect(axisText(twelve)[1]).toBe('twelve sessions')
    expect(axisText([])).toEqual([])
  })
})

describe('historyStats', () => {
  it('reports now, best and the signed change over the shown sessions', () => {
    const pts = [point('2026-09-12', 122), point('2026-10-17', 131), point('2026-10-31', 128.4)]
    expect(historyStats(legPress, pts, pts[1], 20)).toEqual([
      { value: '128', caption: 'e1RM now' },
      { value: '131', caption: 'best, 17 Oct', accent: true },
      { value: '+6', caption: 'over 3 sessions' },
    ])
  })
  it('signs a drop with a hyphen and a flat run as 0', () => {
    const down = [point('2026-10-01', 130), point('2026-10-08', 126)]
    expect(historyStats(legPress, down, down[0], 2)[2]).toEqual({ value: '-4', caption: 'over 2 sessions' })
    const flat = [point('2026-10-01', 130), point('2026-10-08', 130)]
    expect(historyStats(legPress, flat, flat[0], 2)[2].value).toBe('0')
  })
  it('handles one point, and counts only points with an estimate for the change', () => {
    const one = [point('2026-10-31', 128)]
    expect(historyStats(legPress, one, one[0], 1)).toEqual([
      { value: '128', caption: 'e1RM now' },
      { value: '128', caption: 'best, 31 Oct', accent: true },
      { value: '0', caption: 'over 1 session' },
    ])
    const gap = [point('2026-10-01', null), point('2026-10-08', 120), point('2026-10-15', 126)]
    expect(historyStats(legPress, gap, gap[2], 3).map((s) => s.value)).toEqual(['126', '126', '+6'])
  })
  it('works when every point is rough', () => {
    const pts = [point('2026-10-01', 120.4, true), point('2026-10-08', 123.6, true)]
    expect(historyStats(legPress, pts, pts[1], 2).map((s) => s.value)).toEqual(['124', '124', '+4'])
  })
  it('gives lifts without an estimate best set, sessions and the last day', () => {
    const rows = [row(10, 14)]
    const pts = [point('2026-10-03', null, false, [row(0, 12)]), point('2026-10-28', null, false, rows)]
    const stats = historyStats(back, pts, pts[1], 7)
    expect(stats).toEqual([
      { value: 'BW+10 × 14', caption: 'best set' },
      { value: '7', caption: 'sessions' },
      { value: '28 Oct', caption: 'last session' },
    ])
    expect(stats.every((s) => !s.accent)).toBe(true)
  })
  it('falls back to the tallest set for box height, which has no score', () => {
    const pts = [point('2026-10-03', null, false, [row(50, 5)]), point('2026-10-10', null, false, [row(60, 3), row(60, 5, 1)])]
    expect(historyStats(boxJump, pts, null, 2)[0]).toEqual({ value: '60 cm × 5', caption: 'best set' })
  })
  it('has no stats for no sessions', () => {
    expect(historyStats(legPress, [], null, 0)).toEqual([])
  })
})
