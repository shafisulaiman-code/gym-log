import type { CardioSession, Interval } from './types'

export type Segment = { kind: 'warmup' | 'work' | 'rest' | 'cool'; min: number }

// Session shape for the 4x4 timeline. Warm-up and cool-down split whatever the
// duration leaves after the intervals, never below zero.
export function timeline(
  durationMin: number,
  workMin: number,
  restMin: number,
  intervals: number,
): { warmupMin: number; coolMin: number; segments: Segment[] } {
  const core = intervals * workMin + Math.max(0, intervals - 1) * restMin
  const edge = Math.max(0, (durationMin - core) / 2)
  const segments: Segment[] = [{ kind: 'warmup', min: edge }]
  for (let i = 0; i < intervals; i++) {
    segments.push({ kind: 'work', min: workMin })
    if (i < intervals - 1) segments.push({ kind: 'rest', min: restMin })
  }
  segments.push({ kind: 'cool', min: edge })
  return { warmupMin: edge, coolMin: edge, segments }
}

type SharedKey = 'speedKph' | 'inclinePct'

// Changing a shared value moves every interval that still carried the old one;
// an interval the user overrode keeps its own value.
export function applyShared(
  intervals: Interval[],
  key: SharedKey,
  prev: number | undefined,
  next: number | undefined,
): Interval[] {
  return intervals.map((iv) => (iv[key] === prev ? { ...iv, [key]: next } : iv))
}

export function isOverridden(iv: Interval, key: SharedKey, shared: number | undefined): boolean {
  return iv[key] !== undefined && iv[key] !== shared
}

// Prefill copies the plan (duration, speed, incline, per-interval overrides)
// and drops the measurements (heart rates, RPE, note) of the last session.
export function prefillFrom(last: CardioSession): Omit<CardioSession, 'id' | 'workoutId'> {
  const out: Omit<CardioSession, 'id' | 'workoutId'> = {
    modality: last.modality,
    durationMin: last.durationMin,
  }
  if (last.speedKph !== undefined) out.speedKph = last.speedKph
  if (last.inclinePct !== undefined) out.inclinePct = last.inclinePct
  if (last.intervals) {
    out.intervals = last.intervals.map(({ peakHr: _peak, ...rest }) => rest)
  }
  return out
}
