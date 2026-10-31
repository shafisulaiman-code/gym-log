import type { Outlet } from './types'

export type LatLng = { lat: number; lng: number }

export const NEAR_KM = 1.5

// Great-circle distance in km (haversine); plenty for telling gyms apart.
export function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// The closest outlet with coordinates, if it is within NEAR_KM of the position.
export function nearestOutlet(
  outlets: Outlet[],
  here: LatLng,
): { outlet: Outlet; km: number } | null {
  let best: { outlet: Outlet; km: number } | null = null
  for (const o of outlets) {
    if (o.lat === undefined || o.lng === undefined) continue
    const km = distanceKm({ lat: o.lat, lng: o.lng }, here)
    if (km <= NEAR_KM && (!best || km < best.km)) best = { outlet: o, km }
  }
  return best
}
