import { describe, expect, it } from 'vitest'
import { plusDays, withLightWeekEnded, withLightWeekStarted } from './coachStore'
import type { CoachState } from './types'

const NOW = '2026-11-01T10:00:00+08:00'
const past = { startedAt: '2026-09-01T09:00:00+08:00', endsAt: '2026-09-08T09:00:00+08:00' }

describe('withLightWeekStarted', () => {
  it('appends a seven-day week at the same clock time', () => {
    const next = withLightWeekStarted({ lightWeeks: [past], lightWeekSnoozedUntil: NOW }, NOW)
    expect(next.lightWeeks).toEqual([past, { startedAt: NOW, endsAt: '2026-11-08T10:00:00+08:00' }])
    expect(next.lightWeekSnoozedUntil).toBe(NOW)
    expect(plusDays(NOW, 7)).toBe('2026-11-08T10:00:00+08:00')
  })
  it('returns the same state when a light week is already running', () => {
    const state: CoachState = { lightWeeks: [{ startedAt: '2026-10-30T10:00:00+08:00', endsAt: '2026-11-06T10:00:00+08:00' }] }
    expect(withLightWeekStarted(state, NOW)).toBe(state)
    // a double tap: the second start finds the first running
    const once = withLightWeekStarted({ lightWeeks: [] }, NOW)
    expect(withLightWeekStarted(once, NOW)).toBe(once)
    expect(once.lightWeeks).toHaveLength(1)
  })
})

describe('withLightWeekEnded', () => {
  it('ends every running entry at now and leaves the rest', () => {
    const a = { startedAt: '2026-10-29T10:00:00+08:00', endsAt: '2026-11-05T10:00:00+08:00' }
    const b = { startedAt: '2026-10-31T10:00:00+08:00', endsAt: '2026-11-07T10:00:00+08:00' }
    const next = withLightWeekEnded({ lightWeeks: [past, a, b] }, NOW)
    expect(next.lightWeeks).toEqual([past, { ...a, endsAt: NOW }, { ...b, endsAt: NOW }])
  })
  it('returns the same state when none is running', () => {
    const state: CoachState = { lightWeeks: [past] }
    expect(withLightWeekEnded(state, NOW)).toBe(state)
    const ended = withLightWeekEnded(withLightWeekStarted(state, '2026-10-30T10:00:00+08:00'), NOW)
    expect(withLightWeekEnded(ended, NOW)).toBe(ended) // ending twice writes once
  })
})
