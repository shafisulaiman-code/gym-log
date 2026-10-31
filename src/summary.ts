import { formatLast } from './history'
import type { Exercise, SetRow } from './types'

// Total kg moved in completed working sets. Per-hand loads count both hands,
// bodyweight-plus counts the added kg only, timed sets add nothing.
export function volumeKg(rows: SetRow[], exercises: Record<string, Exercise>): number {
  let total = 0
  for (const r of rows) {
    if (!r.completedAt || r.isWarmup) continue
    if (r.weightKg === undefined || r.reps === undefined) continue
    const ex = exercises[r.exerciseId]
    if (!ex || ex.loadMode === 'timed' || ex.loadMode === 'height_cm') continue
    const perSet = ex.loadMode === 'per_hand' ? r.weightKg * 2 : r.weightKg
    total += perSet * r.reps
  }
  return Math.round(total * 100) / 100
}

export type Summary = {
  done: number
  volumeKg: number
  lines: { name: string; text: string }[]
  untickedReal: { count: number; exerciseName?: string }
  nothingLogged: boolean
}

export function summarize(rows: SetRow[], exercises: Record<string, Exercise>): Summary {
  const completed = rows.filter((r) => r.completedAt)
  const lines: Summary['lines'] = []
  for (const exId of new Set(completed.map((r) => r.exerciseId))) {
    const ex = exercises[exId]
    if (!ex) continue
    const own = completed.filter((r) => r.exerciseId === exId).sort((a, b) => a.seq - b.seq)
    lines.push({ name: ex.name, text: formatLast(ex, own).replace(/^Last: /, '') })
  }

  const unticked = rows.filter((r) => !r.completedAt && !r.ghost)
  const names = new Set(unticked.map((r) => exercises[r.exerciseId]?.name))
  const untickedReal: Summary['untickedReal'] = { count: unticked.length }
  if (unticked.length > 0 && names.size === 1) untickedReal.exerciseName = [...names][0]

  return {
    done: completed.length,
    volumeKg: volumeKg(rows, exercises),
    lines,
    untickedReal,
    nothingLogged: completed.length === 0,
  }
}
