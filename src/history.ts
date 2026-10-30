import { db, kettlebellSizesKg } from './db'
import type { Equipment, Exercise, Outlet, SetRow } from './types'
import { fmt, nextSeq, shortOutlet, uuid } from './util'

// Machines and cables are tracked per physical machine (equipmentId), because the
// same "Leg Press" at two outlets has different stacks. Everything else by exerciseId.
export function keyedByEquipment(ex: Exercise): boolean {
  return ['machine_plate', 'machine_selectorised', 'cable'].includes(ex.equipmentType)
}

export async function getOrCreateEquipment(ex: Exercise, outlet: Outlet): Promise<Equipment> {
  const existing = await db.equipment.where({ exerciseId: ex.id, outletId: outlet.id }).first()
  if (existing) return existing
  const eq: Equipment = {
    id: uuid(),
    exerciseId: ex.id,
    outletId: outlet.id,
    label: `${ex.name} @ ${shortOutlet(outlet.name)}`,
    stackStepKg: ex.defaultIncrementKg,
  }
  await db.equipment.add(eq)
  return eq
}

// Completed sets from the most recent earlier session of this exercise/machine.
export async function lastSession(
  ex: Exercise,
  equipmentId: string | undefined,
  excludeWorkoutId: string,
): Promise<SetRow[]> {
  const candidates =
    keyedByEquipment(ex) && equipmentId
      ? await db.sets.where('equipmentId').equals(equipmentId).toArray()
      : await db.sets.where('exerciseId').equals(ex.id).toArray()
  const done = candidates.filter((s) => s.completedAt && s.workoutId !== excludeWorkoutId)
  if (done.length === 0) return []
  const latest = done.reduce((a, b) => (a.completedAt! > b.completedAt! ? a : b))
  return done.filter((s) => s.workoutId === latest.workoutId).sort((a, b) => a.seq - b.seq)
}

export function weightStep(ex: Exercise, eq?: Equipment): number {
  const step = eq?.stackStepKg ?? ex.defaultIncrementKg
  return step > 0 ? step : 2.5
}

// Prefill rule from PLAN.md: copy last session's rows, or one default row.
export function prefillRows(
  ex: Exercise,
  eq: Equipment | undefined,
  workoutId: string,
  last: SetRow[],
): SetRow[] {
  const base = { workoutId, exerciseId: ex.id, equipmentId: eq?.id }
  if (last.length > 0) {
    return last.map((s, i) => ({
      ...base,
      id: uuid(),
      seq: nextSeq(),
      setIndex: i,
      isWarmup: s.isWarmup,
      weightKg: s.weightKg,
      reps: s.reps,
      durationSec: s.durationSec,
    }))
  }
  const row: SetRow = { ...base, id: uuid(), seq: nextSeq(), setIndex: 0, isWarmup: false }
  if (ex.equipmentType === 'kettlebell') {
    row.weightKg = kettlebellSizesKg[1]
  } else if (ex.loadMode === 'bodyweight_plus') {
    row.weightKg = 0
  } else if (ex.equipmentType !== 'bodyweight') {
    row.weightKg = eq?.stackStartKg ?? ex.defaultIncrementKg
  }
  if (ex.loadMode === 'timed') {
    row.durationSec = ex.repRange[0]
  } else {
    row.reps = 10
  }
  return [row]
}

// e.g. "Last: 60 kg × 12, 12, 10" or "Last: 60×12, 65×10"
export function formatLast(ex: Exercise, last: SetRow[]): string {
  if (last.length === 0) return 'Last: —'
  const working = last.filter((s) => !s.isWarmup)
  if (working.length === 0) return 'Last: warm-up only'

  const count = (s: SetRow) =>
    ex.loadMode === 'timed' ? `${fmt(s.durationSec ?? 0)}s` : fmt(s.reps ?? 0)
  const load = (w: number | undefined) => {
    if (ex.loadMode === 'bodyweight_plus') return w ? `BW+${fmt(w)} kg` : 'BW'
    if (w === undefined) return ''
    return `${fmt(w)} kg`
  }

  const weights = new Set(working.map((s) => s.weightKg))
  if (weights.size === 1) {
    const l = load(working[0].weightKg)
    const counts = working.map(count).join(', ')
    return l ? `Last: ${l} × ${counts}` : `Last: ${counts}`
  }
  return 'Last: ' + working.map((s) => `${fmt(s.weightKg ?? 0)}×${count(s)}`).join(', ')
}
