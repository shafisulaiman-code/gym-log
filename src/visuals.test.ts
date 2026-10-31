import { describe, expect, it } from 'vitest'
import { frameUrls } from './visuals'
import type { Exercise } from './types'

const base = {
  id: 'm-leg-press',
  name: 'Leg Press',
  visualId: 'Leg press',
  visualFrames: 2,
} as unknown as Exercise

describe('frameUrls', () => {
  it('returns one URL per frame under the base path', () => {
    expect(frameUrls(base, '/gym-log/')).toEqual([
      '/gym-log/visuals/m-leg-press-1.webp',
      '/gym-log/visuals/m-leg-press-2.webp',
    ])
  })

  it('returns a single URL for a one-frame drawing', () => {
    expect(frameUrls({ ...base, visualFrames: 1 }, '/')).toEqual(['/visuals/m-leg-press-1.webp'])
  })

  it('returns nothing when the exercise has no drawing', () => {
    expect(frameUrls({ ...base, visualId: null, visualFrames: 0 }, '/')).toEqual([])
  })
})
