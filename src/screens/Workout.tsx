import { useEffect, useState } from 'react'
import { db } from '../db'
import {
  formatLast,
  getOrCreateEquipment,
  keyedByEquipment,
  lastSession,
  prefillRows,
  weightStep,
} from '../history'
import type { Equipment, Exercise, Outlet, SetRow, Workout as WorkoutT } from '../types'
import { nextSeq, sgIso, shortOutlet, uuid } from '../util'
import Stepper from '../components/Stepper'
import BellChips from '../components/BellChips'
import Picker from './Picker'

type Props = { workoutId: string; onDone: () => void }

export default function Workout({ workoutId, onDone }: Props) {
  const [workout, setWorkout] = useState<WorkoutT | null>(null)
  const [outlet, setOutlet] = useState<Outlet | null>(null)
  const [exercises, setExercises] = useState<Record<string, Exercise>>({})
  const [equipment, setEquipment] = useState<Record<string, Equipment>>({})
  const [sets, setSets] = useState<SetRow[]>([])
  const [lastLines, setLastLines] = useState<Record<string, string>>({})
  const [picking, setPicking] = useState(false)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])

  useEffect(() => {
    load()
  }, [workoutId])

  async function load() {
    const w = await db.workouts.get(workoutId)
    if (!w) {
      onDone()
      return
    }
    const [o, exList, eqList, rows] = await Promise.all([
      db.outlets.get(w.outletId),
      db.exercises.toArray(),
      db.equipment.toArray(),
      db.sets.where('workoutId').equals(workoutId).toArray(),
    ])
    const exMap = Object.fromEntries(exList.map((e) => [e.id, e]))
    rows.sort((a, b) => a.seq - b.seq)

    const lines: Record<string, string> = {}
    for (const exId of new Set(rows.map((r) => r.exerciseId))) {
      const ex = exMap[exId]
      const eqId = rows.find((r) => r.exerciseId === exId)?.equipmentId
      lines[exId] = formatLast(ex, await lastSession(ex, eqId, workoutId))
    }

    setWorkout(w)
    setOutlet(o ?? null)
    setExercises(exMap)
    setEquipment(Object.fromEntries(eqList.map((e) => [e.id, e])))
    setSets(rows)
    setLastLines(lines)
  }

  // Every change is written straight to the database: there is no Save button.
  function saveRow(row: SetRow) {
    setSets((prev) => prev.map((s) => (s.id === row.id ? row : s)))
    db.sets.put(row)
  }

  async function addExercise(exerciseId: string, equipmentId?: string) {
    setPicking(false)
    if (!workout || !outlet) return
    if (sets.some((s) => s.exerciseId === exerciseId)) {
      document.getElementById(`card-${exerciseId}`)?.scrollIntoView({ behavior: 'smooth' })
      return
    }
    // Re-read so a custom exercise created in the picker is included.
    const ex = exercises[exerciseId] ?? (await db.exercises.get(exerciseId))
    if (!ex) return
    let eq = equipmentId ? await db.equipment.get(equipmentId) : undefined
    if (!eq && keyedByEquipment(ex)) eq = await getOrCreateEquipment(ex, outlet)

    const last = await lastSession(ex, eq?.id, workout.id)
    const rows = prefillRows(ex, eq, workout.id, last)
    await db.sets.bulkAdd(rows)

    setExercises((prev) => ({ ...prev, [ex.id]: ex }))
    if (eq) setEquipment((prev) => ({ ...prev, [eq.id]: eq }))
    setLastLines((prev) => ({ ...prev, [ex.id]: formatLast(ex, last) }))
    setSets((prev) => [...prev, ...rows])
    window.setTimeout(() => {
      document.getElementById(`card-${ex.id}`)?.scrollIntoView({ behavior: 'smooth' })
    }, 50)
  }

  function addSet(exerciseId: string) {
    const rows = sets.filter((s) => s.exerciseId === exerciseId)
    const prev = rows[rows.length - 1]
    const row: SetRow = {
      id: uuid(),
      workoutId,
      exerciseId,
      equipmentId: prev.equipmentId,
      setIndex: rows.length,
      isWarmup: false,
      weightKg: prev.weightKg,
      reps: prev.reps,
      durationSec: prev.durationSec,
      seq: nextSeq(),
    }
    setSets((p) => [...p, row])
    db.sets.add(row)
  }

  function removeLastSet(exerciseId: string) {
    const rows = sets.filter((s) => s.exerciseId === exerciseId)
    const last = rows[rows.length - 1]
    if (last.completedAt) {
      alert('Untick that set first.')
      return
    }
    setSets((p) => p.filter((s) => s.id !== last.id))
    db.sets.delete(last.id)
  }

  function setNotes(notes: string) {
    if (!workout) return
    setWorkout({ ...workout, notes })
    db.workouts.update(workout.id, { notes })
  }

  async function finish() {
    if (!workout) return
    if (!confirm('Finish workout?')) return
    const unfinished = sets.filter((s) => !s.completedAt).map((s) => s.id)
    await db.sets.bulkDelete(unfinished)
    if (sets.length === unfinished.length) {
      // Nothing was logged: don't keep an empty workout.
      await db.workouts.delete(workout.id)
    } else {
      await db.workouts.update(workout.id, { endedAt: sgIso() })
    }
    onDone()
  }

  if (!workout || !outlet) return null

  const exerciseOrder = [...new Set(sets.map((s) => s.exerciseId))]

  return (
    <div className="screen workout">
      <header className="workout-header">
        <div>
          <div className="header-outlet">{shortOutlet(outlet.name)}</div>
          <div className="header-time">{elapsed(workout.startedAt, now)}</div>
        </div>
        <button type="button" className="btn finish" onClick={finish}>
          Finish
        </button>
      </header>

      {exerciseOrder.map((exId) => {
        const ex = exercises[exId]
        const rows = sets.filter((s) => s.exerciseId === exId)
        const eq = rows[0].equipmentId ? equipment[rows[0].equipmentId] : undefined
        let working = 0
        return (
          <section className="card" key={exId} id={`card-${exId}`}>
            <h2>{ex.name}</h2>
            <div className="last-line">{lastLines[exId]}</div>
            {ex.note && <div className="ex-note">{ex.note}</div>}
            {rows.map((row) => (
              <SetRowView
                key={row.id}
                row={row}
                ex={ex}
                step={weightStep(ex, eq)}
                number={row.isWarmup ? 0 : ++working}
                onChange={saveRow}
              />
            ))}
            <div className="card-actions">
              <button type="button" className="btn secondary" onClick={() => removeLastSet(exId)}>
                − Set
              </button>
              <button type="button" className="btn secondary" onClick={() => addSet(exId)}>
                + Set
              </button>
            </div>
          </section>
        )
      })}

      <button type="button" className="btn primary big" onClick={() => setPicking(true)}>
        Add exercise
      </button>

      <label className="field">
        <span>Workout note</span>
        <textarea
          rows={2}
          value={workout.notes ?? ''}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional"
        />
      </label>

      {picking && (
        <Picker outlet={outlet} onPick={addExercise} onClose={() => setPicking(false)} />
      )}
    </div>
  )
}

function SetRowView({
  row,
  ex,
  step,
  number,
  onChange,
}: {
  row: SetRow
  ex: Exercise
  step: number
  number: number
  onChange: (row: SetRow) => void
}) {
  const timed = ex.loadMode === 'timed'
  const kettlebell = ex.equipmentType === 'kettlebell'
  const bodyweight = ex.loadMode === 'bodyweight_plus'
  const noLoad = timed && ex.equipmentType === 'bodyweight' // e.g. plank
  const done = !!row.completedAt

  function toggleDone() {
    if (done) {
      onChange({ ...row, completedAt: undefined })
    } else {
      navigator.vibrate?.(40)
      onChange({ ...row, completedAt: sgIso() })
    }
  }

  return (
    <div className={`set-row ${done ? 'done' : ''} ${row.isWarmup ? 'warmup' : ''}`}>
      <button
        type="button"
        className="badge"
        onClick={() => onChange({ ...row, isWarmup: !row.isWarmup })}
        aria-label="Toggle warm-up"
      >
        {row.isWarmup ? 'W' : number}
      </button>
      <div className="set-controls">
        {!noLoad &&
          (kettlebell ? (
            <BellChips value={row.weightKg} onChange={(kg) => onChange({ ...row, weightKg: kg })} />
          ) : (
            <Stepper
              value={row.weightKg ?? 0}
              step={step}
              unit="kg"
              prefix={bodyweight ? '+' : ''}
              onChange={(v) => onChange({ ...row, weightKg: v ?? 0 })}
            />
          ))}
        {timed ? (
          <Stepper
            value={row.durationSec ?? 30}
            step={5}
            unit="sec"
            onChange={(v) => onChange({ ...row, durationSec: v ?? 0 })}
          />
        ) : (
          <Stepper
            value={row.reps ?? 10}
            step={1}
            unit="reps"
            onChange={(v) => onChange({ ...row, reps: v ?? 0 })}
          />
        )}
      </div>
      <button type="button" className="check" onClick={toggleDone} aria-label="Complete set">
        ✓
      </button>
    </div>
  )
}

function elapsed(startedAt: string, now: number): string {
  const sec = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}
