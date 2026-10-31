import Dexie, { type EntityTable } from 'dexie'
import seed from './data/seed.json'
import { staleSeedIds } from './seedPrune'
import type {
  Bodyweight,
  CardioSession,
  Equipment,
  Exercise,
  Outlet,
  SetRow,
  SyncLog,
  Workout,
} from './types'

class GymDB extends Dexie {
  outlets!: EntityTable<Outlet, 'id'>
  exercises!: EntityTable<Exercise, 'id'>
  equipment!: EntityTable<Equipment, 'id'>
  workouts!: EntityTable<Workout, 'id'>
  sets!: EntityTable<SetRow, 'id'>
  cardio_sessions!: EntityTable<CardioSession, 'id'>
  bodyweight!: EntityTable<Bodyweight, 'id'>
  sync_log!: EntityTable<SyncLog, 'id'>

  constructor() {
    super('gymlog')
    this.version(1).stores({
      outlets: 'id',
      exercises: 'id, category',
      equipment: 'id, exerciseId, outletId, [exerciseId+outletId]',
      workouts: 'id, startedAt, outletId, type',
      sets: 'id, workoutId, exerciseId, equipmentId',
      cardio_sessions: 'id, workoutId, modality',
      bodyweight: 'id, date',
      sync_log: 'id, workoutId', // unused until Phase 4
    })
    // v2: SetRow.ghost, Exercise.cues, Exercise.visualId and visualFrames added. No
    // index changes, no data to migrate (nothing in production yet); the bump records
    // the change. Seed rows removed from seed.json are pruned in setupDb().
    // SetRow.rpe added 2026-10-31: no index, no version bump.
    this.version(2).stores({
      outlets: 'id',
      exercises: 'id, category',
      equipment: 'id, exerciseId, outletId, [exerciseId+outletId]',
      workouts: 'id, startedAt, outletId, type',
      sets: 'id, workoutId, exerciseId, equipmentId',
      cardio_sessions: 'id, workoutId, modality',
      bodyweight: 'id, date',
      sync_log: 'id, workoutId',
    })
  }
}

export const db = new GymDB()

export const kettlebellSizesKg: number[] = seed.kettlebellSizesKg
export const cardioModalities = seed.cardioModalities

// Runs on every app start. bulkPut is safe to repeat: seed rows are overwritten
// with the latest seed.json, custom exercises (random ids) are left alone.
export async function setupDb() {
  await db.outlets.bulkPut(seed.outlets)
  await db.exercises.bulkPut(seed.exercises as unknown as Exercise[])
  const stale = staleSeedIds(
    await db.exercises.toArray(),
    seed.exercises.map((e) => e.id),
  )
  if (stale.length > 0) await db.exercises.bulkDelete(stale)
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist()
    }
  } catch {
    // not available on plain http; fine for local testing
  }
}

export async function findActiveWorkout(): Promise<Workout | undefined> {
  return db.workouts.filter((w) => w.type === 'strength' && !w.endedAt).first()
}
