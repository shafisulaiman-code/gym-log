import type { Exercise } from './types'

// URLs of the technique drawing frames for an exercise, in order. Empty when it
// has none. Files are built by scripts/fetch_visuals.py as visuals/<id>-<n>.webp.
export function frameUrls(ex: Exercise, base: string): string[] {
  if (!ex.visualId || !ex.visualFrames) return []
  return Array.from({ length: ex.visualFrames }, (_, i) => `${base}visuals/${ex.id}-${i + 1}.webp`)
}
