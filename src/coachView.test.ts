import { describe, it, expect } from 'vitest'
import type { CoachRow } from './coach'
import { capRows, daysLeftText, rowCopy } from './coachView'

const stall = (n: number): CoachRow => ({ kind: 'stall', key: `k${n}`, exerciseId: 'e', title: `Lift ${n}`, detail: 'stalled: 3 sessions at 60 x 8' })

describe('rowCopy', () => {
  it('words the due reasons', () => {
    expect(rowCopy({ kind: 'light-due', reason: 'time' })).toEqual({ title: 'Light week due', detail: '6 weeks since the last one' })
    expect(rowCopy({ kind: 'light-due', reason: 'stalls' }).detail).toBe('two lifts are stalled')
    expect(rowCopy({ kind: 'light-due', reason: 'drops' }).detail).toBe('strength dropped twice recently')
  })
  it('words the running week with a singular day', () => {
    expect(rowCopy({ kind: 'light-running', daysLeft: 5 })).toEqual({ title: 'Light week', detail: '5 days left' })
    expect(daysLeftText(1)).toBe('1 day left')
  })
  it('passes stall and PR copy through', () => {
    expect(rowCopy(stall(1))).toEqual({ title: 'Lift 1', detail: 'stalled: 3 sessions at 60 x 8' })
  })
})

describe('capRows', () => {
  it('shows up to six and counts the rest', () => {
    const rows = [1, 2, 3, 4, 5, 6, 7, 8].map(stall)
    const { shown, more } = capRows(rows)
    expect(shown).toHaveLength(6)
    expect(more).toBe(2)
    expect(capRows(rows.slice(0, 6))).toEqual({ shown: rows.slice(0, 6), more: 0 })
  })
})
