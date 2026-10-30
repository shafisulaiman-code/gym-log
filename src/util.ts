// Singapore is UTC+8 all year (no daylight saving), so we shift by a fixed 8 hours.
export function sgIso(d = new Date()): string {
  const shifted = new Date(d.getTime() + 8 * 60 * 60 * 1000)
  return shifted.toISOString().slice(0, 19) + '+08:00'
}

export function sgDate(d = new Date()): string {
  return sgIso(d).slice(0, 10)
}

// crypto.randomUUID only exists on https/localhost; this works on plain http too
// (handy when testing on the phone over Wi-Fi).
export function uuid(): string {
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

let seqCounter = 0
export function nextSeq(): number {
  seqCounter = (seqCounter + 1) % 100
  return Date.now() * 100 + seqCounter
}

export function fmt(n: number): string {
  return String(Math.round(n * 100) / 100)
}

export function minutesBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000)
}

export function shortOutlet(name: string): string {
  return name.replace(/^AF /, '')
}

const LAST_OUTLET_KEY = 'gymlog.lastOutlet'

export function getLastOutlet(): string | null {
  try {
    return localStorage.getItem(LAST_OUTLET_KEY)
  } catch {
    return null
  }
}

export function setLastOutlet(id: string) {
  try {
    localStorage.setItem(LAST_OUTLET_KEY, id)
  } catch {
    // ignore: falls back to the most recent workout's outlet
  }
}
