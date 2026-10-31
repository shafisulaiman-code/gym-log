import { describe, expect, it } from 'vitest'
import { formatRest, restState } from './rest'
import type { SetRow } from './types'

let seq = 0
const row = (exerciseId: string, patch: Partial<SetRow> = {}): SetRow => ({
  id: `r${++seq}`, workoutId: 'w1', exerciseId, setIndex: 0, isWarmup: false, seq, ...patch,
})
const T0 = '2026-10-31T10:00:00+08:00'
const ms = (iso: string, plusSec = 0) => new Date(iso).getTime() + plusSec * 1000

describe('restState', () => {
  it('is null with no completed row', () => {
    expect(restState([row('a')], ms(T0))).toBeNull()
  })
  it('targets 60 while the ticked exercise has open rows, including ghosts', () => {
    const a1 = row('a', { completedAt: T0 })
    const r = restState([a1, row('a', { ghost: true })], ms(T0, 18))!
    expect(r).toMatchObject({ row: a1, target: 60, elapsed: 18, remaining: 42, over: false })
  })
  it('targets 120 when the ticked exercise has no open rows, whatever else is open', () => {
    const r = restState([row('a', { completedAt: T0 }), row('b')], ms(T0, 12))!
    expect(r.target).toBe(120)
    expect(r.remaining).toBe(108)
  })
  it('drops back to 60 when a set is added to the ticked exercise during the rest', () => {
    const rows = [row('a', { completedAt: T0 })]
    expect(restState(rows, ms(T0, 5))!.target).toBe(120)
    expect(restState([...rows, row('a')], ms(T0, 5))!.target).toBe(60)
  })
  it('is over once elapsed reaches the target and remaining goes negative', () => {
    const r = restState([row('a', { completedAt: T0 }), row('a')], ms(T0, 75))!
    expect(r).toMatchObject({ over: true, remaining: -15 })
    expect(restState([row('a', { completedAt: T0 }), row('a')], ms(T0, 60))!.over).toBe(true)
  })
  it('hides after target plus five minutes', () => {
    const sets = [row('a', { completedAt: T0 }), row('a')]
    expect(restState(sets, ms(T0, 359))).not.toBeNull()
    expect(restState(sets, ms(T0, 360))).toBeNull()
  })
  it('uses the latest completedAt, and seq to break a tie within one second', () => {
    const first = row('a', { completedAt: T0 })
    const second = row('b', { completedAt: T0 })
    expect(restState([first, second, row('a'), row('b')], ms(T0, 1))!.row).toBe(second)
  })
  it('falls back to the previous tick when the last one is unticked', () => {
    const a1 = row('a', { completedAt: '2026-10-31T10:00:00+08:00' })
    const a2 = row('a', { completedAt: '2026-10-31T10:01:00+08:00' })
    const open = { ...a2, completedAt: undefined }
    expect(restState([a1, open, row('a')], ms(T0, 70))!.row).toBe(a1)
  })
  it('clamps elapsed to zero when the tick is in the future', () => {
    const r = restState([row('a', { completedAt: T0 }), row('a')], ms(T0, -30))!
    expect(r.elapsed).toBe(0)
    expect(r.remaining).toBe(60)
  })
  it('floors partial seconds', () => {
    const r = restState([row('a', { completedAt: T0 }), row('a')], ms(T0) + 1999)!
    expect(r.elapsed).toBe(1)
  })
})

describe('formatRest', () => {
  it('formats m:ss and +m:ss', () => {
    expect(formatRest(42)).toBe('0:42')
    expect(formatRest(108)).toBe('1:48')
    expect(formatRest(0)).toBe('+0:00')
    expect(formatRest(-15)).toBe('+0:15')
    expect(formatRest(-75)).toBe('+1:15')
  })
})
