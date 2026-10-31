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

// Unit of the load field: centimetres for box height, kilograms otherwise.
export function loadUnit(ex: Exercise): 'kg' | 'cm' {
  return ex.loadMode === 'height_cm' ? 'cm' : 'kg'
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
      ghost: true,
    }))
  }
  const row: SetRow = { ...base, id: uuid(), seq: nextSeq(), setIndex: 0, isWarmup: false }
  if (ex.equipmentType === 'kettlebell') {
    row.weightKg = kettlebellSizesKg[1]
  } else if (ex.loadMode === 'bodyweight_plus') {
    row.weightKg = 0
  } else if (ex.loadMode === 'height_cm') {
    row.weightKg = 50
  } else if (ex.equipmentType !== 'bodyweight') {
    row.weightKg = eq?.stackStartKg ?? ex.defaultIncrementKg
  } else if (ex.loadMode === 'total') {
    row.weightKg = 6 // a hand-held implement with no stack, e.g. a medicine ball
  }
  if (ex.loadMode === 'timed') {
    row.durationSec = ex.repRange[0]
  } else {
    row.reps = 10
  }
  return [row]
}

// Set rows whose exercise has left the library (pruned seed row) are skipped.
export function knownRows(rows: SetRow[], exercises: Record<string, Exercise>): SetRow[] {
  return rows.filter((r) => exercises[r.exerciseId])
}

export type Rating = { rpe?: number; pain?: 'back' | 'knee' }

// The effort and pain recorded at the end of an exercise: from the latest
// completed row that carries either one (seq breaks completedAt ties).
export function ratingOf(rows: SetRow[]): Rating {
  let best: SetRow | undefined
  for (const r of rows) {
    if (!r.completedAt || (r.rpe === undefined && r.painFlag === undefined)) continue
    if (!best || r.completedAt > best.completedAt! || (r.completedAt === best.completedAt && r.seq > best.seq)) {
      best = r
    }
  }
  if (!best) return {}
  const out: Rating = {}
  if (best.rpe !== undefined) out.rpe = best.rpe
  if (best.painFlag !== undefined) out.pain = best.painFlag
  return out
}

// e.g. "Last: 60 kg × 12, 12, 10 · 8/10 · back" or "Last: 60×12, 65×10"
export function formatLast(ex: Exercise, last: SetRow[]): string {
  if (last.length === 0) return 'Last: —'
  const text = loadText(ex, last, { units: true })
  if (text === '') return 'Last: warm-up only'
  const { rpe, pain } = ratingOf(last)
  return `Last: ${text}` + (rpe !== undefined ? ` · ${rpe}/10` : '') + (pain ? ` · ${pain}` : '')
}

// The weekly summary's form of one session: no units (kg is stated once in the
// file's header), "ph" for per hand, timed sets as seconds with no load.
// e.g. "100 × 12, 12, 10", "14 ph × 10", "BW+10 × 12", "45s", "100×12, 105×10"
export function formatSession(ex: Exercise, rows: SetRow[]): string {
  return loadText(ex, rows, { units: false })
}

// Working sets only; '' when there are none.
function loadText(ex: Exercise, rows: SetRow[], { units }: { units: boolean }): string {
  const working = rows.filter((s) => !s.isWarmup)
  if (working.length === 0) return ''

  const timed = ex.loadMode === 'timed'
  const count = (s: SetRow) => (timed ? `${fmt(s.durationSec ?? 0)}s` : fmt(s.reps ?? 0))
  const load = (w: number | undefined) => {
    if (ex.loadMode === 'bodyweight_plus') return w ? `BW+${fmt(w)}${units ? ' kg' : ''}` : 'BW'
    if (w === undefined || (timed && !units)) return ''
    if (units || ex.loadMode === 'height_cm') return `${fmt(w)} ${loadUnit(ex)}`
    return ex.loadMode === 'per_hand' ? `${fmt(w)} ph` : fmt(w)
  }

  const weights = new Set(working.map((s) => s.weightKg))
  if (weights.size === 1 || (timed && !units)) {
    const l = load(working[0].weightKg)
    const counts = working.map(count).join(', ')
    return l ? `${l} × ${counts}` : counts
  }
  return working.map((s) => `${fmt(s.weightKg ?? 0)}×${count(s)}`).join(', ')
}

// Header pill and progress strip: every row counts (ghost included), done = ticked.
export function countSets(rows: SetRow[]): { done: number; total: number } {
  return { done: rows.filter((r) => r.completedAt).length, total: rows.length }
}

// Every distinct weight ever ticked on this exercise, for the kettlebell chip row.
export async function distinctWeights(exerciseId: string): Promise<number[]> {
  const rows = await db.sets.where('exerciseId').equals(exerciseId).toArray()
  const used = rows.filter((r) => r.completedAt && r.weightKg !== undefined).map((r) => r.weightKg!)
  return [...new Set(used)]
}
