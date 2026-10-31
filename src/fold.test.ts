import { describe, expect, it } from 'vitest'
import { cardFolded } from './fold'
import type { SetRow } from './types'

const row = (patch: Partial<SetRow> = {}): SetRow =>
  ({ id: 'r', workoutId: 'w', exerciseId: 'a', setIndex: 0, isWarmup: false, seq: 1, ...patch }) as SetRow

describe('cardFolded', () => {
  it('folds a card whose every row is ticked', () => {
    expect(cardFolded([row({ completedAt: 't' }), row({ completedAt: 't' })], false)).toBe(true)
  })
  it('stays open while any row is unticked, ghost or real', () => {
    expect(cardFolded([row({ completedAt: 't' }), row({ ghost: true })], false)).toBe(false)
    expect(cardFolded([row({ completedAt: 't' }), row()], false)).toBe(false)
  })
  it('stays open when pinned open by a tap, and when there are no rows', () => {
    expect(cardFolded([row({ completedAt: 't' })], true)).toBe(false)
    expect(cardFolded([], false)).toBe(false)
  })
})
