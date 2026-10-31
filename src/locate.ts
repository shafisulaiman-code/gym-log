import type { LatLng } from './geo'

const PERMISSION_DENIED = 1

// Two tries: a quick low-power one happy with a recent cached fix, then a
// patient high-accuracy one for when the phone has just come back from
// airplane mode and has neither a network location nor a warm GPS.
export const ATTEMPTS: PositionOptions[] = [
  { maximumAge: 300_000, timeout: 8_000, enableHighAccuracy: false },
  { maximumAge: 0, timeout: 25_000, enableHighAccuracy: true },
]

// Options for the try after a failed one, or null to give up. A denied
// permission is final; asking again would only nag.
export function nextAttempt(attempt: number, errorCode: number): PositionOptions | null {
  if (errorCode === PERMISSION_DENIED) return null
  return ATTEMPTS[attempt + 1] ?? null
}

// Run the attempts in order until one gives a fix. Returns a cancel function;
// a fix arriving after cancel is dropped. No geolocation (desktop, insecure
// origin) means nothing happens.
export function locate(geo: Geolocation | undefined, onFix: (here: LatLng) => void): () => void {
  let cancelled = false
  const run = (attempt: number) => {
    geo?.getCurrentPosition(
      (pos) => {
        if (!cancelled) onFix({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      },
      (err) => {
        const next = nextAttempt(attempt, err.code)
        if (next && !cancelled) run(attempt + 1)
      },
      ATTEMPTS[attempt],
    )
  }
  run(0)
  return () => {
    cancelled = true
  }
}
