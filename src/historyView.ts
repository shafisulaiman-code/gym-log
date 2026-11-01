// Pure shaping for the lift history sheet: sparkline geometry, the three stats
// and the axis text. No React and no database access.
import { formatTarget, score, type HistoryPoint } from './coach'
import type { Exercise } from './types'
import { dateOf, dayLabel } from './week'

export const SPARK_W = 380
const X_MIN = 10
const X_MAX = 370
const Y_TOP = 12 // room for the best dot (r 6 plus a 3 px stroke) at both ends
const Y_BOTTOM = 108

// Dot positions in the 380 x 120 viewBox. y runs from (min - pad) to (max + pad) with
// pad = max(1, (max - min) * 0.15); x is evenly spaced over 10 to 370; one point sits in the middle.
export function sparkLayout(kgs: number[]): { x: number; y: number }[] {
  if (kgs.length === 0) return []
  const min = Math.min(...kgs)
  const max = Math.max(...kgs)
  const pad = Math.max(1, (max - min) * 0.15)
  const lo = min - pad
  const span = max + pad - lo
  return kgs.map((kg, i) => ({
    x: kgs.length === 1 ? (X_MIN + X_MAX) / 2 : X_MIN + (i * (X_MAX - X_MIN)) / (kgs.length - 1),
    y: Y_BOTTOM - ((kg - lo) / span) * (Y_BOTTOM - Y_TOP),
  }))
}

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']

// "one" to "twelve", the digit beyond.
export function countWord(n: number): string {
  return n >= 1 && n < WORDS.length ? WORDS[n] : String(n)
}

// "17 Oct": the day label without its weekday.
export function shortDay(iso: string): string {
  return dayLabel(dateOf(iso)).replace(/^\w+ /, '')
}

export type Stat = { value: string; caption: string; accent?: boolean }

export function hasEstimate(points: HistoryPoint[]): boolean {
  return points.some((p) => p.e1rm !== null)
}

// Latest estimate, best ever shown (accent), and the change from the oldest shown
// estimate to the latest. Lifts without an estimate: best set, sessions logged, last session.
// `total` is every session logged, `shown` the points on the sheet.
export function historyStats(
  ex: Exercise,
  points: HistoryPoint[],
  best: HistoryPoint | null,
  total: number,
): Stat[] {
  if (points.length === 0) return []
  const withEst = points.filter((p) => p.e1rm !== null)
  if (withEst.length > 0) {
    const now = Math.round(withEst[withEst.length - 1].e1rm!.kg)
    const first = Math.round(withEst[0].e1rm!.kg)
    const delta = now - first
    const top = best?.e1rm ?? withEst[withEst.length - 1].e1rm!
    return [
      { value: String(now), caption: 'e1RM now' },
      {
        value: String(Math.round(top.kg)),
        caption: `best, ${shortDay(best ? best.session.workout.startedAt : points[points.length - 1].session.workout.startedAt)}`,
        accent: true,
      },
      {
        value: delta > 0 ? `+${delta}` : String(delta),
        caption: `over ${points.length} ${points.length === 1 ? 'session' : 'sessions'}`,
      },
    ]
  }
  return [
    { value: bestSet(ex, points, best), caption: 'best set' },
    { value: String(total), caption: total === 1 ? 'session' : 'sessions' },
    { value: shortDay(points[points.length - 1].session.workout.startedAt), caption: 'last session' },
  ]
}

// "BW+10 × 12", "24 × 45s" and so on; box height has no score, so the tallest working set.
function bestSet(ex: Exercise, points: HistoryPoint[], best: HistoryPoint | null): string {
  const sc = best && score(ex, best.session.rows)
  if (sc) return formatTarget(ex, sc[0], sc[1])
  let top: { w: number; n: number } | null = null
  for (const p of points) {
    for (const r of p.session.rows) {
      if (r.isWarmup || !r.completedAt) continue
      const w = r.weightKg ?? 0
      const n = (ex.loadMode === 'timed' ? r.durationSec : r.reps) ?? 0
      if (!top || w > top.w || (w === top.w && n > top.n)) top = { w, n }
    }
  }
  return top ? formatTarget(ex, top.w, top.n) : '·'
}

// "12 Sep", "twelve sessions", "31 Oct"; one session reads as a single phrase.
export function axisText(points: HistoryPoint[]): string[] {
  if (points.length === 0) return []
  const first = shortDay(points[0].session.workout.startedAt)
  const last = shortDay(points[points.length - 1].session.workout.startedAt)
  if (points.length === 1) return [`${first} · one session`]
  return [first, `${countWord(points.length)} sessions`, last]
}
