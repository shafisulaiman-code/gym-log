import type { SetRow } from './types'

export const REST_AFTER_SET = 60
export const REST_AFTER_EXERCISE = 120
export const REST_WINDOW = 300

export type Rest = {
  row: SetRow // the last tick
  target: 60 | 120
  elapsed: number // whole seconds, >= 0
  remaining: number // target - elapsed, negative when over
  over: boolean // elapsed >= target
}

// The rest countdown the dock shows after a tick, derived from the rows and the
// clock alone. The last tick is the row with the greatest completedAt (seq
// breaks ties). The target is 120 s when its exercise has no open rows left
// (ghosts count as open), else 60 s. Hidden once elapsed passes target + 300 s.
export function restState(sets: SetRow[], nowMs: number): Rest | null {
  let last: SetRow | null = null
  let lastMs = 0
  for (const s of sets) {
    if (!s.completedAt) continue
    const t = new Date(s.completedAt).getTime()
    if (Number.isNaN(t)) continue
    if (!last || t > lastMs || (t === lastMs && s.seq > last.seq)) {
      last = s
      lastMs = t
    }
  }
  if (!last) return null

  const exerciseId = last.exerciseId
  const hasOpen = sets.some((s) => s.exerciseId === exerciseId && !s.completedAt)
  const target = hasOpen ? REST_AFTER_SET : REST_AFTER_EXERCISE
  const elapsed = Math.max(0, Math.floor((nowMs - lastMs) / 1000))
  if (elapsed >= target + REST_WINDOW) return null
  return { row: last, target, elapsed, remaining: target - elapsed, over: elapsed >= target }
}

// "0:42" while counting down, "+0:15" once over (zero counts as over).
export function formatRest(remaining: number): string {
  const abs = Math.abs(remaining)
  const text = `${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`
  return remaining > 0 ? text : `+${text}`
}
