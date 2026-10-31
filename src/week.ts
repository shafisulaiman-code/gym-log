// Singapore calendar weeks from 'YYYY-MM-DD' strings. Stored timestamps carry
// a +08:00 offset, so their first ten characters are already the Singapore
// date. Everything here is integer or UTC arithmetic, never the machine's
// local time zone.

export type Week = { start: string; end: string; isoYear: number; week: number } // start Monday, end Sunday

const DAY_MS = 86_400_000
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function dateOf(iso: string): string {
  return iso.slice(0, 10)
}

function toUtc(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function fromUtc(ms: number): string {
  const d = new Date(ms)
  const y = String(d.getUTCFullYear()).padStart(4, '0')
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDays(date: string, n: number): string {
  return fromUtc(toUtc(date) + n * DAY_MS)
}

export function daysBetween(a: string, b: string): number {
  return Math.round((toUtc(b) - toUtc(a)) / DAY_MS)
}

export function weekOf(iso: string): Week {
  const date = dateOf(iso)
  const ms = toUtc(date)
  const start = addDays(date, -((new Date(ms).getUTCDay() + 6) % 7))
  const thursday = new Date(toUtc(start) + 3 * DAY_MS)
  const isoYear = thursday.getUTCFullYear()
  const dayOfYear = Math.round((thursday.getTime() - Date.UTC(isoYear, 0, 1)) / DAY_MS) + 1
  return { start, end: addDays(start, 6), isoYear, week: 1 + Math.floor((dayOfYear - 1) / 7) }
}

export function previousWeek(w: Week): Week {
  return weekOf(addDays(w.start, -7))
}

export function inWeek(iso: string, w: Week): boolean {
  const d = dateOf(iso)
  return d >= w.start && d <= w.end
}

export function dayLabel(date: string): string {
  const d = new Date(toUtc(date))
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

export function dayLabelYear(date: string): string {
  return `${dayLabel(date)} ${new Date(toUtc(date)).getUTCFullYear()}`
}
