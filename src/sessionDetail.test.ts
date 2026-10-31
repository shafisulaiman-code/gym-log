import { describe, expect, it } from 'vitest'
import { cardioLines } from './sessionDetail'
import type { CardioSession } from './types'

const base: CardioSession = { id: 'c1', workoutId: 'w1', modality: 'treadmill_4x4', durationMin: 38 }

describe('cardioLines', () => {
  it('always gives the modality and duration', () => {
    expect(cardioLines(base)).toEqual([
      { label: 'Type', value: '4x4' },
      { label: 'Duration', value: '38 min' },
    ])
  })

  it('adds speed, incline, heart rates and RPE when present, in that order', () => {
    const full: CardioSession = {
      ...base,
      modality: 'treadmill_z2',
      speedKph: 6.5,
      inclinePct: 2,
      avgHr: 142,
      maxHr: 171,
      rpe: 7,
    }
    expect(cardioLines(full).map((l) => `${l.label}: ${l.value}`)).toEqual([
      'Type: Zone 2',
      'Duration: 38 min',
      'Speed: 6.5 km/h',
      'Incline: 2%',
      'Avg HR: 142',
      'Max HR: 171',
      'RPE: 7',
    ])
  })
})
