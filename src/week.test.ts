import { describe, expect, it } from 'vitest'
import { addDays, dateOf, dayLabel, dayLabelYear, daysBetween, inWeek, previousWeek, weekOf } from './week'

describe('weekOf', () => {
  it('finds the Monday to Sunday week in Singapore dates', () => {
    expect(weekOf('2026-10-31T23:59:59+08:00')).toEqual({ start: '2026-10-26', end: '2026-11-01', isoYear: 2026, week: 44 })
    expect(weekOf('2026-10-26')).toEqual(weekOf('2026-11-01'))
    expect(weekOf('2026-11-02').week).toBe(45)
  })
  it('uses the ISO year at the year boundary', () => {
    expect(weekOf('2027-01-01')).toEqual({ start: '2026-12-28', end: '2027-01-03', isoYear: 2026, week: 53 })
    expect(weekOf('2027-01-04')).toMatchObject({ isoYear: 2027, week: 1 })
    expect(weekOf('2026-01-01')).toMatchObject({ start: '2025-12-29', isoYear: 2026, week: 1 })
  })
})

describe('previousWeek and inWeek', () => {
  it('steps back seven days', () => {
    expect(previousWeek(weekOf('2026-10-31'))).toMatchObject({ start: '2026-10-19', end: '2026-10-25', week: 43 })
  })
  it('includes both ends and excludes the neighbours', () => {
    const w = weekOf('2026-10-31')
    expect(inWeek('2026-10-26T00:00:00+08:00', w)).toBe(true)
    expect(inWeek('2026-11-01T23:59:59+08:00', w)).toBe(true)
    expect(inWeek('2026-10-25T23:59:59+08:00', w)).toBe(false)
    expect(inWeek('2026-11-02T00:00:00+08:00', w)).toBe(false)
  })
})

describe('date helpers', () => {
  it('formats labels and does day arithmetic', () => {
    expect(dateOf('2026-10-31T10:00:00+08:00')).toBe('2026-10-31')
    expect(dayLabel('2026-10-26')).toBe('Mon 26 Oct')
    expect(dayLabelYear('2026-11-01')).toBe('Sun 1 Nov 2026')
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-10-31', -28)).toBe('2026-10-03')
    expect(daysBetween('2026-09-29', '2026-10-27')).toBe(28)
  })
})
