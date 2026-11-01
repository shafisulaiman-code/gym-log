import { inLightWeek } from './coach'
import { db, kettlebellSizesKg } from './db'
import type { CoachTag, Equipment, Exercise, LightWeek, Outlet, SetRow } from './types'
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

// The rows of the latest workout (by startedAt) that started outside every light week,
// or of the latest workout when all of them started inside one (a light week is not
// evidence of anything, so it only counts when nothing earlier exists). A workout is
// inside a light week by its startedAt, the same test sessionsFor uses, so the "Last"
// line, the ghost rows and the nudge always agree. `done` holds completed rows for one
// key, from any workouts; `startedAtOf` gives each workout's startedAt (a workout it
// does not know falls back to its latest completedAt).
export function pickLastSession(
  done: SetRow[],
  lightWeeks: LightWeek[],
  startedAtOf: (workoutId: string) => string | undefined,
): SetRow[] {
  if (done.length === 0) return []
  const started = new Map<string, string>()
  for (const s of done) {
    const known = startedAtOf(s.workoutId)
    const at = started.get(s.workoutId)
    if (known !== undefined) started.set(s.workoutId, known)
    else if (at === undefined || s.completedAt! > at) started.set(s.workoutId, s.completedAt!)
  }
  const latestOf = (ids: [string, string][]) => ids.reduce((a, b) => (a[1] > b[1] ? a : b))[0]
  const all = [...started]
  const normal = all.filter(([, at]) => !inLightWeek(at, lightWeeks))
  const workoutId = latestOf(normal.length > 0 ? normal : all)
  return done.filter((s) => s.workoutId === workoutId).sort((a, b) => a.seq - b.seq)
}

// Completed sets from the most recent earlier session of this exercise/machine,
// skipping sessions inside a light week while an earlier one exists.
export async function lastSession(
  ex: Exercise,
  equipmentId: string | undefined,
  excludeWorkoutId: string,
  lightWeeks: LightWeek[] = [],
): Promise<SetRow[]> {
  const candidates =
    keyedByEquipment(ex) && equipmentId
      ? await db.sets.where('equipmentId').equals(equipmentId).toArray()
      : await db.sets.where('exerciseId').equals(ex.id).toArray()
  const done = candidates.filter((s) => s.completedAt && s.workoutId !== excludeWorkoutId)
  const ids = [...new Set(done.map((s) => s.workoutId))]
  const workouts = await db.workouts.bulkGet(ids)
  const startedAt = new Map(workouts.filter((w) => w !== undefined).map((w) => [w.id, w.startedAt]))
  return pickLastSession(done, lightWeeks, (id) => startedAt.get(id))
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

// Taking a nudge: every ghost working row of the exercise takes the target load and count
// and the coach tag, and stays a ghost; real rows and warm-ups are never touched. A light
// week with fewer sets drops the trailing ghost working rows. A row with no weight (a plank,
// a jump rope) keeps none when the target load is 0, so it never reads "0 kg".
// `mine` is every row of the exercise.
export function applyPlan(
  ex: Exercise,
  mine: SetRow[],
  target: { state: string; tag: CoachTag; w: number; count: number; sets: number },
): { put: SetRow[]; remove: SetRow[] } {
  const ghosts = mine.filter((r) => r.ghost && !r.isWarmup)
  const keep = target.state === 'light' ? ghosts.slice(0, target.sets) : ghosts
  const put = keep.map(
    (r): SetRow => ({
      ...r,
      ...(r.weightKg === undefined && target.w === 0 ? {} : { weightKg: target.w }),
      ...(ex.loadMode === 'timed' ? { durationSec: target.count } : { reps: target.count }),
      coach: target.tag,
    }),
  )
  return { put, remove: ghosts.slice(keep.length) }
}

// Undoing a nudge: warm-up rows are left alone; the ghost working rows go and last
// time's working rows come back, minus the working rows the user already made real.
// The fresh rows take the removed ghosts' seq values (then fresh ones after the last
// row) so the card and its sets keep their place. Every row that stays and still carries
// a coach tag (one he edited by hand after the tap) loses it: `patch` holds those rows
// untagged, so the weekly file never reports an offer he undid. `mine` is every row of
// the exercise.
export function undoPlan(mine: SetRow[], prefill: SetRow[]): { remove: SetRow[]; add: SetRow[]; patch: SetRow[] } {
  const remove = mine.filter((r) => r.ghost && !r.isWarmup)
  const realWorking = mine.filter((r) => !r.ghost && !r.isWarmup).length
  let tail = Math.max(0, ...mine.map((r) => r.seq))
  const add = prefill
    .filter((r) => !r.isWarmup)
    .slice(realWorking)
    .map((r, i) => ({ ...r, seq: remove[i]?.seq ?? ++tail }))
  const patch = mine
    .filter((r) => r.coach && !remove.includes(r))
    .map((r) => {
      const { coach: _coach, ...rest } = r
      return rest
    })
  return { remove, add, patch }
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
// file's header), "ph" for per hand, timed sets as seconds (with the load when there is one).
// e.g. "100 × 12, 12, 10", "14 ph × 10", "BW+10 × 12", "45s", "24 × 45s, 45s", "100×12, 105×10", "14 ph×10, 16 ph×8"
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
    if (w === undefined) return ''
    if (units || ex.loadMode === 'height_cm') return `${fmt(w)} ${loadUnit(ex)}`
    return ex.loadMode === 'per_hand' ? `${fmt(w)} ph` : fmt(w)
  }

  // In the summary form, bodyweight plus with no weight and with 0 are the same "BW".
  const same = (w: number | undefined) => (!units && ex.loadMode === 'bodyweight_plus' ? (w ?? 0) : w)
  const weights = new Set(working.map((s) => same(s.weightKg)))
  if (weights.size === 1) {
    const l = load(working[0].weightKg)
    const counts = working.map(count).join(', ')
    return l ? `${l} × ${counts}` : counts
  }
  // Mixed weights: "60×12, 65×10" in the Last line; the summary keeps each set's
  // marker, e.g. "14 ph×10, 16 ph×8", "BW×15, BW+10×12", "50 cm×5, 60 cm×5".
  const each = (s: SetRow) => (units ? fmt(s.weightKg ?? 0) : load(s.weightKg ?? 0))
  return working.map((s) => `${each(s)}×${count(s)}`).join(', ')
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
