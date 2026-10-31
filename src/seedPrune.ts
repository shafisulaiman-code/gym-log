import type { Exercise } from './types'

// Seed exercises that were removed from seed.json: bulkPut never deletes, so
// setupDb removes these explicitly. Custom (user-made) exercises are kept.
export function staleSeedIds(existing: Pick<Exercise, 'id' | 'custom'>[], seedIds: string[]): string[] {
  return existing.filter((e) => !e.custom && !seedIds.includes(e.id)).map((e) => e.id)
}
