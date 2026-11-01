import type { CoachRow } from './coach'

export const MAX_ROWS = 6

const DUE_DETAIL = {
  time: '6 weeks since the last one',
  stalls: 'two lifts are stalled',
  drops: 'strength dropped twice recently',
} as const

// "1 day left", "5 days left".
export function daysLeftText(n: number): string {
  return `${n} ${n === 1 ? 'day' : 'days'} left`
}

// Title and detail for a coach card row.
export function rowCopy(row: CoachRow): { title: string; detail: string } {
  switch (row.kind) {
    case 'light-due':
      return { title: 'Light week due', detail: DUE_DETAIL[row.reason] }
    case 'light-running':
      return { title: 'Light week', detail: daysLeftText(row.daysLeft) }
    default:
      return { title: row.title, detail: row.detail }
  }
}

// The rows to draw and how many were cut off.
export function capRows(rows: CoachRow[]): { shown: CoachRow[]; more: number } {
  return { shown: rows.slice(0, MAX_ROWS), more: Math.max(0, rows.length - MAX_ROWS) }
}
