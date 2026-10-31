import type { CardioSession } from './types'
import { fmt } from './util'

export const CARDIO_LABELS: Record<string, string> = {
  treadmill_z2: 'Zone 2',
  treadmill_4x4: '4x4',
  bike: 'Bike',
}

// Label/value rows for a past cardio session, only the fields that were logged.
export function cardioLines(c: CardioSession): { label: string; value: string }[] {
  const lines = [
    { label: 'Type', value: CARDIO_LABELS[c.modality] ?? c.modality },
    { label: 'Duration', value: `${fmt(c.durationMin)} min` },
  ]
  if (c.speedKph !== undefined) lines.push({ label: 'Speed', value: `${fmt(c.speedKph)} km/h` })
  if (c.inclinePct !== undefined) lines.push({ label: 'Incline', value: `${fmt(c.inclinePct)}%` })
  if (c.avgHr !== undefined) lines.push({ label: 'Avg HR', value: String(c.avgHr) })
  if (c.maxHr !== undefined) lines.push({ label: 'Max HR', value: String(c.maxHr) })
  if (c.rpe !== undefined) lines.push({ label: 'RPE', value: String(c.rpe) })
  return lines
}
