import { describe, expect, it, vi } from 'vitest'
import { ATTEMPTS, locate, nextAttempt } from './locate'

const DENIED = 1
const UNAVAILABLE = 2
const TIMEOUT = 3

type Handler = (err: { code: number }) => void
type Success = (pos: { coords: { latitude: number; longitude: number } }) => void

// A fake Geolocation whose calls resolve in the order given: a number is an
// error code, a pair is a fix.
function fakeGeo(script: Array<number | [number, number]>) {
  const calls: PositionOptions[] = []
  let i = 0
  const geo = {
    getCurrentPosition(ok: Success, fail: Handler, opts: PositionOptions) {
      calls.push(opts)
      const step = script[i++]
      if (Array.isArray(step)) ok({ coords: { latitude: step[0], longitude: step[1] } })
      else fail({ code: step })
    },
  }
  return { geo: geo as unknown as Geolocation, calls }
}

describe('nextAttempt', () => {
  it('follows a quick low-power timeout with a patient high-accuracy try', () => {
    expect(nextAttempt(0, TIMEOUT)).toBe(ATTEMPTS[1])
    expect(ATTEMPTS[1].enableHighAccuracy).toBe(true)
    expect(ATTEMPTS[1].timeout).toBeGreaterThan(ATTEMPTS[0].timeout!)
  })
  it('gives up after the last attempt', () => {
    expect(nextAttempt(ATTEMPTS.length - 1, UNAVAILABLE)).toBeNull()
  })
  it('never retries a denied permission', () => {
    expect(nextAttempt(0, DENIED)).toBeNull()
  })
})

describe('locate', () => {
  it('reports the fix from the retry when the first try times out', () => {
    const { geo, calls } = fakeGeo([TIMEOUT, [1.3448, 103.9382]])
    const onFix = vi.fn()
    locate(geo, onFix)
    expect(calls).toEqual([ATTEMPTS[0], ATTEMPTS[1]])
    expect(onFix).toHaveBeenCalledWith({ lat: 1.3448, lng: 103.9382 })
  })
  it('stops at a denied permission', () => {
    const { geo, calls } = fakeGeo([DENIED, [1, 1]])
    const onFix = vi.fn()
    locate(geo, onFix)
    expect(calls).toHaveLength(1)
    expect(onFix).not.toHaveBeenCalled()
  })
  it('does nothing without geolocation and ignores a fix after cancel', () => {
    expect(() => locate(undefined, () => {})()).not.toThrow()
    let resolve: Success = () => {}
    const geo = { getCurrentPosition: (ok: Success) => { resolve = ok } } as unknown as Geolocation
    const onFix = vi.fn()
    const cancel = locate(geo, onFix)
    cancel()
    resolve({ coords: { latitude: 1, longitude: 1 } })
    expect(onFix).not.toHaveBeenCalled()
  })
})
