import { describe, expect, it } from 'vitest'
import { nextSet } from './nextSet'
import type { SetRow } from './types'

let seq = 0
const row = (exerciseId: string, patch: Partial<SetRow> = {}): SetRow => ({
  id: `r${++seq}`,
  workoutId: 'w1',
  exerciseId,
  setIndex: 0,
  isWarmup: false,
  seq,
  ...patch,
})

describe('nextSet', () => {
  it('returns null for an empty workout', () => {
    expect(nextSet([])).toBeNull()
  })

  it('returns the first unticked set with its number and total for that exercise', () => {
    const a1 = row('a', { completedAt: 't', weightKg: 60, reps: 10 })
    const a2 = row('a', { weightKg: 60, reps: 10 })
    const a3 = row('a', { weightKg: 60, reps: 10 })
    expect(nextSet([a1, a2, a3])).toEqual({ row: a2, number: 2, total: 3 })
  })

  it('stays on the current exercise even when a later-added set has a higher seq', () => {
    const a1 = row('a', { completedAt: 't' })
    const b1 = row('b')
    const a2 = row('a') // "+ Set" on a, appended after b was added
    expect(nextSet([a1, b1, a2])?.row).toBe(a2)
  })

  it('reports warm-ups as number 0 and leaves them out of the total', () => {
    const w = row('a', { isWarmup: true })
    const a1 = row('a')
    expect(nextSet([w, a1])).toEqual({ row: w, number: 0, total: 1 })
  })

  it('returns null when every set is ticked', () => {
    expect(nextSet([row('a', { completedAt: 't' }), row('b', { completedAt: 't' })])).toBeNull()
  })

  it('includes ghost rows as candidates', () => {
    const g = row('a', { ghost: true })
    expect(nextSet([g])?.row).toBe(g)
  })
})
