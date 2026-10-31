import { describe, it, expect } from 'vitest'
import { parseWeight, bellSizes } from './weights'

describe('parseWeight', () => {
  it('accepts positive decimals', () => {
    expect(parseWeight('18')).toBe(18)
    expect(parseWeight(' 17,5 ')).toBe(17.5)
    expect(parseWeight('2.333')).toBe(2.33)
  })

  it('rejects empty, zero, negative and junk', () => {
    for (const s of ['', '   ', '0', '-4', 'abc', 'NaN', 'Infinity']) {
      expect(parseWeight(s), `input ${JSON.stringify(s)}`).toBeNull()
    }
  })
})

describe('bellSizes', () => {
  it('unions and sorts without duplicates', () => {
    expect(bellSizes([8, 12, 16], [18, 12, 10])).toEqual([8, 10, 12, 16, 18])
  })

  it('returns the seed sizes when nothing has been used', () => {
    expect(bellSizes([8, 12], [])).toEqual([8, 12])
  })
})
