import { describe, expect, it } from 'vitest'
import { CHIPS, chipsFor, exercisesFor } from './muscles'
import type { Exercise } from './types'

const ex = (id: string, muscles: string[], gated = false) =>
  ({ id, name: id, primaryMuscles: muscles, gated, custom: false }) as unknown as Exercise

describe('chipsFor', () => {
  it('maps every seed muscle to its chip', () => {
    expect(chipsFor('lats')).toEqual(['Back'])
    expect(chipsFor('lower back')).toEqual(['Back'])
    expect(chipsFor('rear delts')).toEqual(['Shoulders'])
    expect(chipsFor('calves')).toEqual(['Legs'])
    expect(chipsFor('hip flexors')).toEqual(['Legs'])
    expect(chipsFor('glutes')).toEqual(['Glutes'])
  })
  it('maps grip and unknown strings to no chip', () => {
    expect(chipsFor('grip')).toEqual([])
    expect(chipsFor('made up')).toEqual([])
  })
})

describe('exercisesFor', () => {
  const list = [
    ex('b-row', ['lats', 'upper back']),
    ex('a-curl', ['biceps']),
    ex('deadlift', ['back'], true),
    ex('custom', []),
  ]
  it('returns matching exercises sorted by name, gated included', () => {
    expect(exercisesFor('Back', list).map((e) => e.id)).toEqual(['b-row', 'deadlift'])
  })
  it('never returns an exercise with no muscles', () => {
    for (const c of CHIPS) expect(exercisesFor(c, list).map((e) => e.id)).not.toContain('custom')
  })
})
