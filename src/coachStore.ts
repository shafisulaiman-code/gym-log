import { db } from './db'
import type { CoachRecord, CoachState, LightWeek } from './types'
import { sgIso } from './util'

export const EMPTY_COACH: CoachState = { lightWeeks: [] }

const DAY_MS = 86_400_000

// Adds whole days and keeps the Singapore clock time.
export function plusDays(iso: string, days: number): string {
  return sgIso(new Date(new Date(iso).getTime() + days * DAY_MS))
}

export async function loadCoachState(): Promise<CoachState> {
  const row = await db.coach.get('state')
  if (!row) return { lightWeeks: [] }
  const { key: _key, ...state } = row
  return state
}

async function save(state: CoachState): Promise<CoachState> {
  const record: CoachRecord = { key: 'state', ...state }
  await db.coach.put(record)
  return state
}

const runningAt = (t: number) => (w: LightWeek) => new Date(w.startedAt).getTime() <= t && t < new Date(w.endsAt).getTime()

// A new seven-day light week from now; the same state when one is already running.
export function withLightWeekStarted(state: CoachState, now: string): CoachState {
  if (state.lightWeeks.some(runningAt(new Date(now).getTime()))) return state
  return { ...state, lightWeeks: [...state.lightWeeks, { startedAt: now, endsAt: plusDays(now, 7) }] }
}

// Every running light week ends now; the same state when none is running.
export function withLightWeekEnded(state: CoachState, now: string): CoachState {
  const running = runningAt(new Date(now).getTime())
  if (!state.lightWeeks.some(running)) return state
  return { ...state, lightWeeks: state.lightWeeks.map((w) => (running(w) ? { ...w, endsAt: now } : w)) }
}

// A second tap (or a week already running) writes nothing.
export async function startLightWeek(now: string): Promise<CoachState> {
  const state = await loadCoachState()
  const next = withLightWeekStarted(state, now)
  return next === state ? state : save(next)
}

// Ends the running light week early. Does nothing when none is running.
export async function endLightWeek(now: string): Promise<CoachState> {
  const state = await loadCoachState()
  const next = withLightWeekEnded(state, now)
  return next === state ? state : save(next)
}

export async function snoozeLightWeek(now: string): Promise<CoachState> {
  const state = await loadCoachState()
  return save({ ...state, lightWeekSnoozedUntil: plusDays(now, 7) })
}
