import { describe, expect, it } from 'vitest'
import { staleSeedIds } from './seedPrune'

describe('staleSeedIds', () => {
  it('returns non-custom ids that left the seed and keeps custom ones', () => {
    const existing = [
      { id: 'm-pec-fly-rear-delt', custom: false },
      { id: 'm-leg-press', custom: false },
      { id: 'abc-123', custom: true },
    ]
    expect(staleSeedIds(existing, ['m-leg-press', 'm-pec-fly'])).toEqual(['m-pec-fly-rear-delt'])
  })
})
