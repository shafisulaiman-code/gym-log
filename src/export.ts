import { db } from './db'
import type { SetRow } from './types'
import { sgDate, sgIso } from './util'

export async function buildExport() {
  const [outlets, exercises, equipment, workouts, sets, cardio, bodyweight] = await Promise.all([
    db.outlets.toArray(),
    db.exercises.toArray(),
    db.equipment.toArray(),
    db.workouts.orderBy('startedAt').toArray(),
    db.sets.toArray(),
    db.cardio_sessions.toArray(),
    db.bodyweight.orderBy('date').toArray(),
  ])
  const outletName = (id: string) => outlets.find((o) => o.id === id)?.name ?? id
  const exerciseName = (id: string) => exercises.find((e) => e.id === id)?.name ?? id
  const equipmentLabel = (id?: string) => equipment.find((e) => e.id === id)?.label ?? null

  const strength = workouts
    .filter((w) => w.type === 'strength' && w.endedAt)
    .map((w) => {
      const done = sets
        .filter((s) => s.workoutId === w.id && s.completedAt)
        .sort((a, b) => a.seq - b.seq)
      // Group by exercise, keeping the order exercises were added.
      const groups = new Map<string, SetRow[]>()
      for (const s of done) {
        if (!groups.has(s.exerciseId)) groups.set(s.exerciseId, [])
        groups.get(s.exerciseId)!.push(s)
      }
      return {
        id: w.id,
        date: w.startedAt.slice(0, 10),
        startedAt: w.startedAt,
        endedAt: w.endedAt,
        outlet: outletName(w.outletId),
        type: w.type,
        notes: w.notes || undefined,
        exercises: [...groups.values()].map((g) => ({
          name: exerciseName(g[0].exerciseId),
          equipment: equipmentLabel(g[0].equipmentId),
          sets: g.map((s) => ({
            w: s.weightKg,
            r: s.reps,
            s: s.durationSec,
            warmup: s.isWarmup,
            rpe: s.rpe,
            pain: s.painFlag,
            completedAt: s.completedAt,
          })),
        })),
      }
    })

  const cardioOut = cardio
    .map((c) => {
      const w = workouts.find((x) => x.id === c.workoutId)
      return {
        id: c.id,
        date: w ? w.startedAt.slice(0, 10) : undefined,
        outlet: w ? outletName(w.outletId) : undefined,
        modality: c.modality,
        durationMin: c.durationMin,
        inclinePct: c.inclinePct,
        speedKph: c.speedKph,
        avgHr: c.avgHr,
        maxHr: c.maxHr,
        intervals: c.intervals,
        rpe: c.rpe,
        notes: c.notes || undefined,
      }
    })
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))

  return {
    schema: 'gymlog/1',
    exportedAt: sgIso(),
    outlets,
    exercises,
    equipment,
    workouts: strength,
    cardio: cardioOut,
    bodyweight: bodyweight.map((b) => ({ date: b.date, kg: b.kg, waistCm: b.waistCm })),
  }
}

export async function buildExportFile(): Promise<File> {
  const data = await buildExport()
  const name = `gymlog-${sgDate()}.json`
  const json = JSON.stringify(data, null, 2)
  return new File([json], name, { type: 'application/json' })
}

// Share sheet when the browser offers one for files, otherwise a plain download.
// Over plain http Chrome blocks both; the export sheet then falls back to copy or text.
export async function shareOrDownload(file: File): Promise<void> {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name })
      return
    } catch (e) {
      if ((e as Error).name === 'AbortError') return // user closed the share sheet
      // otherwise fall through to a plain download
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// True on success. False when the clipboard API is missing (plain http) or refuses.
export async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
