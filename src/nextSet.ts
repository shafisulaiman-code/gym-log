import type { SetRow } from './types'

export type NextSet = { row: SetRow; number: number; total: number }

// The set the "Up next" dock points at: the first unticked row, walking the
// exercises in the order they were added and each exercise's rows by seq.
// `number` is the row's working-set number (0 for a warm-up), `total` the
// working sets of that exercise.
export function nextSet(sets: SetRow[]): NextSet | null {
  const sorted = [...sets].sort((a, b) => a.seq - b.seq)
  const order = [...new Set(sorted.map((s) => s.exerciseId))]
  for (const exId of order) {
    const rows = sorted.filter((s) => s.exerciseId === exId)
    let number = 0
    for (const row of rows) {
      if (!row.isWarmup) number += 1
      if (!row.completedAt) {
        return { row, number: row.isWarmup ? 0 : number, total: rows.filter((r) => !r.isWarmup).length }
      }
    }
  }
  return null
}
