import { db } from './db'
import type { CoachRecord, CoachState } from './types'
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

export async function startLightWeek(now: string): Promise<CoachState> {
  const state = await loadCoachState()
  return save({
    ...state,
    lightWeeks: [...state.lightWeeks, { startedAt: now, endsAt: plusDays(now, 7) }],
  })
}

// Ends the running light week early. Does nothing when none is running.
export async function endLightWeek(now: string): Promise<CoachState> {
  const state = await loadCoachState()
  const t = new Date(now).getTime()
  const i = state.lightWeeks.findIndex(
    (w) => new Date(w.startedAt).getTime() <= t && t < new Date(w.endsAt).getTime(),
  )
  if (i < 0) return state
  const lightWeeks = state.lightWeeks.map((w, j) => (j === i ? { ...w, endsAt: now } : w))
  return save({ ...state, lightWeeks })
}

export async function snoozeLightWeek(now: string): Promise<CoachState> {
  const state = await loadCoachState()
  return save({ ...state, lightWeekSnoozedUntil: plusDays(now, 7) })
}
