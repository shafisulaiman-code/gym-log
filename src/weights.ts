// Parses a typed weight. Accepts "17.5" or "17,5"; anything that is not a
// positive finite number returns null so the caller keeps the current value.
export function parseWeight(text: string): number | null {
  const n = Number(text.trim().replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 100) / 100
}

// Seed bell sizes plus every size actually used, ascending, no duplicates.
export function bellSizes(seed: number[], used: number[]): number[] {
  return [...new Set([...seed, ...used])].sort((a, b) => a - b)
}
