import type { SetRow } from './types'

// A card folds to one line once every set on it is ticked, so the exercise you
// are on stays in view. A tap pins it open again for the rest of the session.
export function cardFolded(rows: SetRow[], pinnedOpen: boolean): boolean {
  return rows.length > 0 && !pinnedOpen && rows.every((r) => !!r.completedAt)
}
