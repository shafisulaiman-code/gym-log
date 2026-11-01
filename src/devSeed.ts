// Dev-server-only test data for the Phase 3 phone test. Never runs in the
// production build: main.tsx only calls it under import.meta.env.DEV.
//
//   ?seed=coach   inserts six weeks of fake history (ids start with "seed-") and resets the coach state
//   ?seed=clear   removes every fake row and the coach state (light weeks, snooze)
//
// Real workouts are never touched: every seeded row carries a "seed-" id.
import { db } from './db'
import type { Equipment, Outlet, SetRow, Workout } from './types'
import { sgIso } from './util'

// The fake history lives at its own outlet, so it never mixes with a real
// machine's history (machines are keyed per outlet). Pick "Seed Gym" on Home.
const OUTLET = 'seed-outlet'
const OUTLET_ROW: Outlet = { id: OUTLET, name: 'Seed Gym (test)' }
const LEG_PRESS_EQ = 'seed-eq-leg-press'
const LAT_PULLDOWN_EQ = 'seed-eq-lat-pulldown'

type Plan = {
  daysAgo: number
  exerciseId: string
  equipmentId?: string
  sets: [number, number][] // [kg, reps]
  rpe?: number
  hour?: number
}

// Dates are relative to today so the checks keep working whenever the seed runs.
const PLANS: Plan[] = [
  // Leg Press: progress, then three flat sessions (stall), first workout 45 days ago
  // (so "Light week due" fires on the 42-day clock).
  { daysAgo: 45, exerciseId: 'm-leg-press', equipmentId: LEG_PRESS_EQ, sets: [[95, 12], [95, 12], [95, 12]], rpe: 8 },
  { daysAgo: 38, exerciseId: 'm-leg-press', equipmentId: LEG_PRESS_EQ, sets: [[97.5, 12], [97.5, 12], [97.5, 11]], rpe: 8 },
  { daysAgo: 24, exerciseId: 'm-leg-press', equipmentId: LEG_PRESS_EQ, sets: [[100, 12], [100, 12], [100, 10]], rpe: 8 },
  { daysAgo: 17, exerciseId: 'm-leg-press', equipmentId: LEG_PRESS_EQ, sets: [[100, 12], [100, 12], [100, 10]], rpe: 9 },
  { daysAgo: 3, exerciseId: 'm-leg-press', equipmentId: LEG_PRESS_EQ, sets: [[100, 12], [100, 12], [100, 10]], rpe: 8 },
  // Dumbbell Bench: two earlier sessions, then a PR today (early morning).
  { daysAgo: 20, exerciseId: 'db-bench', sets: [[24, 10], [24, 10], [24, 9]], rpe: 8 },
  { daysAgo: 13, exerciseId: 'db-bench', sets: [[26, 10], [26, 10], [26, 8]], rpe: 8 },
  { daysAgo: 0, exerciseId: 'db-bench', sets: [[26, 12], [26, 12], [26, 11]], rpe: 9, hour: 7 },
  // Lat Pulldown: last session rated 10, so the card shows Hold.
  { daysAgo: 5, exerciseId: 'm-lat-pulldown', equipmentId: LAT_PULLDOWN_EQ, sets: [[60, 10], [60, 9], [60, 8]], rpe: 10 },
]

function dateDaysAgo(days: number): string {
  return sgIso(new Date(Date.now() - days * 86_400_000)).slice(0, 10)
}

export async function seedCoach(): Promise<{ workouts: number; sets: number }> {
  const equipment: Equipment[] = [
    { id: LEG_PRESS_EQ, exerciseId: 'm-leg-press', outletId: OUTLET, label: 'Leg Press @ Seed Gym', stackStepKg: 2.5 },
    { id: LAT_PULLDOWN_EQ, exerciseId: 'm-lat-pulldown', outletId: OUTLET, label: 'Lat Pulldown @ Seed Gym', stackStepKg: 5 },
  ]
  const workouts: Workout[] = []
  const sets: SetRow[] = []
  let seq = 1
  PLANS.forEach((p, n) => {
    const date = dateDaysAgo(p.daysAgo)
    const hh = String(p.hour ?? 18).padStart(2, '0')
    const id = `seed-w-${n}`
    workouts.push({ id, startedAt: `${date}T${hh}:00:00+08:00`, endedAt: `${date}T${hh}:52:00+08:00`, outletId: OUTLET, type: 'strength' })
    p.sets.forEach(([weightKg, reps], i) => {
      const row: SetRow = {
        id: `seed-s-${n}-${i}`,
        workoutId: id,
        exerciseId: p.exerciseId,
        equipmentId: p.equipmentId,
        setIndex: i,
        isWarmup: false,
        weightKg,
        reps,
        seq: seq++,
        completedAt: `${date}T${hh}:${String(10 + i * 3).padStart(2, '0')}:00+08:00`,
      }
      if (p.rpe !== undefined && i === p.sets.length - 1) row.rpe = p.rpe
      sets.push(row)
    })
  })
  // Also reset the coach state (a snooze or a running light week from an
  // earlier try), so every seed load starts the light week checks afresh.
  await db.transaction('rw', db.outlets, db.equipment, db.workouts, db.sets, db.coach, async () => {
    await db.coach.clear()
    await db.outlets.put(OUTLET_ROW)
    await db.equipment.bulkPut(equipment)
    await db.workouts.bulkPut(workouts)
    await db.sets.bulkPut(sets)
  })
  return { workouts: workouts.length, sets: sets.length }
}

export async function clearSeed(): Promise<void> {
  const seeded = (id: string) => id.startsWith('seed-')
  await db.transaction('rw', db.outlets, db.equipment, db.workouts, db.sets, db.coach, async () => {
    await db.sets.filter((s) => seeded(s.id)).delete()
    await db.workouts.filter((w) => seeded(w.id)).delete()
    await db.equipment.filter((e) => seeded(e.id)).delete()
    await db.outlets.filter((o) => seeded(o.id)).delete()
    await db.coach.clear()
  })
}

// Handles the ?seed= query on the dev server, then strips it from the URL.
export async function runDevSeed(): Promise<void> {
  const param = new URLSearchParams(location.search).get('seed')
  if (!param) return
  // An alert, because the phone has no console to read.
  try {
    if (param === 'coach') {
      const n = await seedCoach()
      alert(`Seed loaded: ${n.workouts} workouts, ${n.sets} sets at Seed Gym (test).`)
    } else if (param === 'clear') {
      await clearSeed()
      alert('Seed cleared: fake rows and coach state removed.')
    } else {
      alert(`Unknown seed "${param}". Use ?seed=coach or ?seed=clear.`)
    }
  } catch (e) {
    alert(`Seed failed: ${(e as Error).message}`)
  }
  history.replaceState(null, '', location.pathname)
}
