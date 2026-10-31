// The weekly Markdown summary Shafi shares to his claude.ai Project. A pure
// function over the raw tables (no database access). It states what happened
// and nothing more: no verdicts, averages, e1RM or suggestions.
import { isOverridden } from './cardio'
import { cardioModalities } from './db'
import type { GymData } from './export'
import { formatSession, keyedByEquipment, ratingOf } from './history'
import { CHIPS, chipsFor } from './muscles'
import { CARDIO_LABELS } from './sessionDetail'
import { volumeKg } from './summary'
import type { Exercise, SetRow, Workout } from './types'
import { fmt, minutesBetween, shortOutlet } from './util'
import { type Week, dateOf, dayLabel, dayLabelYear, daysBetween, inWeek } from './week'

export function weeklyFileName(week: Week): string {
  return `gymlog-week-${week.isoYear}-W${String(week.week).padStart(2, '0')}.md`
}

type Ctx = {
  data: GymData
  week: Week
  exercises: Record<string, Exercise>
  finished: Workout[] // every finished workout, by startedAt ascending
  thisWeek: Workout[] // the finished ones that start in the week
  outletName: (id: string) => string
}

export function weeklySummary(data: GymData, week: Week, generatedAt: string): string {
  const finished = data.workouts.filter((w) => w.endedAt).sort((a, b) => a.startedAt.localeCompare(b.startedAt))
  const ctx: Ctx = {
    data,
    week,
    exercises: Object.fromEntries(data.exercises.map((e) => [e.id, e])),
    finished,
    thisWeek: finished.filter((w) => inWeek(w.startedAt, week)),
    outletName: (id) => shortOutlet(data.outlets.find((o) => o.id === id)?.name ?? id),
  }
  const sections = [header(week, generatedAt), sessions(ctx), strength(ctx), muscles(ctx), cardio(ctx), bodyweight(ctx), notes(ctx)]
  return sections.filter((s): s is string => s !== null).join('\n\n') + '\n'
}

function header(week: Week, generatedAt: string): string {
  return [
    `# Gym Log · week ${week.week} · ${dayLabel(week.start)} to ${dayLabelYear(week.end)}`,
    `Generated ${dayLabelYear(dateOf(generatedAt))} ${generatedAt.slice(11, 16)} (+08:00). Weights in kg. "ph" = per hand. Effort is RPE out of 10.`,
  ].join('\n')
}

const row = (cells: string[]) => `| ${cells.join(' | ')} |`

// Heart-rate text shared by the sessions table and the cardio bullets.
function hr(avg?: number, max?: number): string[] {
  const out: string[] = []
  if (avg !== undefined) out.push(`avg ${avg}`)
  if (max !== undefined) out.push(`max ${max}`)
  return out
}

function sessions(ctx: Ctx): string {
  if (ctx.thisWeek.length === 0) return '## Sessions\nNo sessions this week.'
  const lines = ['## Sessions', row(['Date', 'Outlet', 'Type', 'Duration', 'Sets', 'Volume']), row(['---', '---', '---', '---', '---', '---'])]
  for (const w of ctx.thisWeek) {
    const day = dayLabel(dateOf(w.startedAt))
    const outlet = ctx.outletName(w.outletId)
    if (w.type === 'cardio') {
      const c = ctx.data.cardio.find((x) => x.workoutId === w.id)
      const duration = c ? c.durationMin : minutesBetween(w.startedAt, w.endedAt!)
      const label = c ? (CARDIO_LABELS[c.modality] ?? c.modality) : ''
      lines.push(row([day, outlet, 'Cardio', `${fmt(duration)} min`, label, c ? hr(c.avgHr, c.maxHr).join(' · ') : '']))
    } else {
      const done = ctx.data.sets.filter((s) => s.workoutId === w.id && s.completedAt && ctx.exercises[s.exerciseId])
      const volume = volumeKg(done, ctx.exercises).toLocaleString('en-SG')
      lines.push(row([day, outlet, 'Strength', `${minutesBetween(w.startedAt, w.endedAt!)} min`, String(done.length), `${volume} kg`]))
    }
  }
  return lines.join('\n')
}

// Machines and cables are keyed per physical machine, so the same machine at two
// outlets never mixes; everything else by exercise.
function keyOf(ex: Exercise, s: SetRow): string {
  return keyedByEquipment(ex) && s.equipmentId ? `eq:${s.equipmentId}` : `ex:${ex.id}`
}

// Completed working rows with a known exercise from finished workouts in the week.
function weekWorkingRows(ctx: Ctx): SetRow[] {
  const ids = new Set(ctx.thisWeek.map((w) => w.id))
  return ctx.data.sets.filter((s) => ids.has(s.workoutId) && s.completedAt && !s.isWarmup && ctx.exercises[s.exerciseId])
}

function strength(ctx: Ctx): string | null {
  const inWeekRows = weekWorkingRows(ctx)
  if (inWeekRows.length === 0) return null

  // Every completed row (warm-ups included) of finished workouts, by key and workout.
  const finishedById = new Map(ctx.finished.map((w) => [w.id, w]))
  const byKey = new Map<string, Map<string, SetRow[]>>()
  for (const s of ctx.data.sets) {
    const ex = ctx.exercises[s.exerciseId]
    if (!ex || !s.completedAt || !finishedById.has(s.workoutId)) continue
    const key = keyOf(ex, s)
    if (!byKey.has(key)) byKey.set(key, new Map())
    const perWorkout = byKey.get(key)!
    if (!perWorkout.has(s.workoutId)) perWorkout.set(s.workoutId, [])
    perWorkout.get(s.workoutId)!.push(s)
  }

  // Headings by first appearance in the week.
  const first = new Map<string, { at: string; row: SetRow }>()
  for (const s of inWeekRows) {
    const key = keyOf(ctx.exercises[s.exerciseId], s)
    const seen = first.get(key)
    if (!seen || s.completedAt! < seen.at) first.set(key, { at: s.completedAt!, row: s })
  }
  const keys = [...first.entries()].sort((a, b) => a[1].at.localeCompare(b[1].at))

  const blocks = ['## Strength, by exercise']
  for (const [key, { row: sample }] of keys) {
    const ex = ctx.exercises[sample.exerciseId]
    let heading = `### ${ex.name}`
    if (key.startsWith('eq:')) {
      const equipment = ctx.data.equipment.find((e) => e.id === sample.equipmentId)
      if (equipment) heading += ` (${ctx.outletName(equipment.outletId)} machine)`
    }

    // Sessions with at least one working set for this key, newest first.
    const sessionsForKey = [...byKey.get(key)!.entries()]
      .filter(([, rows]) => rows.some((r) => !r.isWarmup))
      .map(([id, rows]) => ({ workout: finishedById.get(id)!, rows: rows.sort((a, b) => a.seq - b.seq) }))
      .sort((a, b) => b.workout.startedAt.localeCompare(a.workout.startedAt))
    const current = sessionsForKey.filter((x) => inWeek(x.workout.startedAt, ctx.week))
    const prior = sessionsForKey.filter((x) => dateOf(x.workout.startedAt) < ctx.week.start).slice(0, 3)

    const bullet = (x: { workout: Workout; rows: SetRow[] }) => {
      const { rpe, pain } = ratingOf(x.rows)
      const parts = [dayLabel(dateOf(x.workout.startedAt)), formatSession(ex, x.rows)]
      if (rpe !== undefined) parts.push(`RPE ${rpe}`)
      if (pain) parts.push(pain)
      return parts.join(' · ')
    }
    blocks.push([heading, ...current.map((x) => `- **${bullet(x)}**`), ...prior.map((x) => `- ${bullet(x)}`)].join('\n'))
  }
  return blocks.join('\n\n')
}

function muscles(ctx: Ctx): string | null {
  const rows = weekWorkingRows(ctx)
  if (rows.length === 0) return null
  const counts = new Map<string, number>(CHIPS.map((c) => [c, 0]))
  for (const s of rows) {
    for (const chip of new Set(ctx.exercises[s.exerciseId].primaryMuscles.flatMap(chipsFor))) {
      counts.set(chip, counts.get(chip)! + 1)
    }
  }
  // Array.prototype.sort is stable, so ties keep the CHIPS order.
  const line = [...CHIPS].sort((a, b) => counts.get(b)! - counts.get(a)!).map((c) => `${c} ${counts.get(c)}`)
  return `## Working sets per muscle this week\n${line.join(' · ')}`
}

function cardio(ctx: Ctx): string | null {
  const lines: string[] = []
  for (const w of ctx.thisWeek) {
    const c = ctx.data.cardio.find((x) => x.workoutId === w.id)
    if (!c) continue
    const parts = [dayLabel(dateOf(w.startedAt)), cardioModalities.find((m) => m.id === c.modality)?.name ?? c.modality, `${fmt(c.durationMin)} min`]

    const shared: string[] = []
    if (c.speedKph !== undefined) shared.push(`${fmt(c.speedKph)} km/h`)
    if (c.inclinePct !== undefined) shared.push(`${fmt(c.inclinePct)}%`)
    const overrides: string[] = []
    ;(c.intervals ?? []).forEach((iv, i) => {
      if (isOverridden(iv, 'speedKph', c.speedKph)) overrides.push(`(int ${i + 1}: ${fmt(iv.speedKph!)} km/h)`)
      if (isOverridden(iv, 'inclinePct', c.inclinePct)) overrides.push(`(int ${i + 1}: ${fmt(iv.inclinePct!)}%)`)
    })
    const pace = [shared.join(' at '), ...overrides].filter((s) => s !== '').join(' ')
    if (pace) parts.push(pace)

    const peaks = (c.intervals ?? []).filter((iv) => iv.peakHr !== undefined).map((iv) => iv.peakHr)
    if (peaks.length > 0) parts.push(`peaks ${peaks.join(', ')}`)
    parts.push(...hr(c.avgHr, c.maxHr))
    if (c.rpe !== undefined) parts.push(`RPE ${c.rpe}`)
    lines.push(`- ${parts.join(' · ')}`)
  }
  return lines.length > 0 ? `## Cardio\n${lines.join('\n')}` : null
}

function bodyweight(ctx: Ctx): string | null {
  const entries = ctx.data.bodyweight.filter((b) => inWeek(b.date, ctx.week)).sort((a, b) => a.date.localeCompare(b.date))
  if (entries.length === 0) return null
  const lines = entries.map((b) => `- ${dayLabel(b.date)} · ${fmt(b.kg)} kg` + (b.waistCm !== undefined ? ` · waist ${fmt(b.waistCm)} cm` : ''))

  // The entry nearest 28 days before the latest one, within three days; earlier wins a tie.
  const latest = entries[entries.length - 1]
  let then: (typeof entries)[number] | undefined
  for (const b of ctx.data.bodyweight) {
    const gap = daysBetween(b.date, latest.date)
    if (gap < 25 || gap > 31) continue
    const off = Math.abs(gap - 28)
    const best = then && Math.abs(daysBetween(then.date, latest.date) - 28)
    if (!then || off < best! || (off === best && b.date < then.date)) then = b
  }
  if (then) {
    const tenths = Math.round((latest.kg - then.kg) * 10)
    const size = (Math.abs(tenths) / 10).toFixed(1)
    const delta = tenths < 0 ? `−${size}` : tenths > 0 ? `+${size}` : size
    lines.push(`- Four weeks ago (${dayLabel(then.date)}): ${fmt(then.kg)} kg. Change: ${delta} kg`)
  }
  return `## Bodyweight\n${lines.join('\n')}`
}

function notes(ctx: Ctx): string | null {
  const lines = ctx.thisWeek
    .filter((w) => w.notes && w.notes.trim() !== '')
    .map((w) => `- ${dayLabel(dateOf(w.startedAt))}: "${w.notes!.trim()}"`)
  return lines.length > 0 ? `## Notes\n${lines.join('\n')}` : null
}
