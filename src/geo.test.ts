import { describe, expect, it } from 'vitest'
import { distanceKm, makeOutlet, nearestOutlet } from './geo'
import type { Outlet } from './types'

const TW = { lat: 1.3448, lng: 103.9382 }
const TC = { lat: 1.3541, lng: 103.9436 }
const tw: Outlet = { id: 'tw', name: 'AF Tampines West', ...TW }
const tc: Outlet = { id: 'tc', name: 'AF Tampines Central', ...TC }
const noCoords: Outlet = { id: 'x', name: 'AF Somewhere' }

describe('distanceKm', () => {
  it('is zero for the same point and about 1.2 km between the Tampines outlets', () => {
    expect(distanceKm(TW, TW)).toBe(0)
    expect(distanceKm(TW, TC)).toBeGreaterThan(1.1)
    expect(distanceKm(TW, TC)).toBeLessThan(1.3)
  })
})

describe('nearestOutlet', () => {
  it('returns the closest outlet within range with its distance', () => {
    const r = nearestOutlet([tw, tc, noCoords], { lat: 1.3452, lng: 103.9385 })
    expect(r?.outlet.id).toBe('tw')
    expect(r!.km).toBeLessThan(0.1)
  })
  it('returns null when nothing is within 1.5 km', () => {
    expect(nearestOutlet([tw, tc], { lat: 1.3, lng: 103.8 })).toBeNull()
  })
  it('ignores outlets without coordinates', () => {
    expect(nearestOutlet([noCoords], { lat: 1.3448, lng: 103.9382 })).toBeNull()
  })
})

describe('makeOutlet', () => {
  it('builds an outlet with a trimmed name and the current coordinates', () => {
    const o = makeOutlet('  Hotel gym KL ', { lat: 3.15, lng: 101.71 })
    expect(o).toMatchObject({ name: 'Hotel gym KL', lat: 3.15, lng: 101.71 })
    expect(o!.id).toMatch(/^[0-9a-f-]{20,}$/)
  })
  it('returns null for a blank name', () => {
    expect(makeOutlet('   ', { lat: 1, lng: 1 })).toBeNull()
  })
})
