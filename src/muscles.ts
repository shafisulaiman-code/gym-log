import type { Exercise } from './types'

// The picker's muscle chips, in display order.
export const CHIPS = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Legs', 'Glutes', 'Core'] as const
export type Chip = (typeof CHIPS)[number]

// Seed primaryMuscles value -> chip. Anything missing (grip, future values) maps to
// no chip and the exercise shows only under All.
const CHIP_OF: Record<string, Chip> = {
  chest: 'Chest',
  back: 'Back',
  lats: 'Back',
  'upper back': 'Back',
  'lower back': 'Back',
  shoulders: 'Shoulders',
  'rear delts': 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  quads: 'Legs',
  hamstrings: 'Legs',
  adductors: 'Legs',
  'hip flexors': 'Legs',
  calves: 'Legs',
  glutes: 'Glutes',
  core: 'Core',
}

export function chipsFor(muscle: string): Chip[] {
  const chip = CHIP_OF[muscle]
  return chip ? [chip] : []
}

// Every exercise that hits the chip's muscles, gated ones included, by name.
export function exercisesFor(chip: Chip, exercises: Exercise[]): Exercise[] {
  return exercises
    .filter((e) => e.primaryMuscles.some((m) => chipsFor(m).includes(chip)))
    .sort((a, b) => a.name.localeCompare(b.name))
}
