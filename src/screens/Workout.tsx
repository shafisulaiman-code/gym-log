import { useEffect, useState } from 'react'
import { db } from '../db'
import {
  countSets,
  distinctWeights,
  formatLast,
  getOrCreateEquipment,
  keyedByEquipment,
  lastSession,
  loadUnit,
  prefillRows,
  weightStep,
} from '../history'
import type { Equipment, Exercise, Outlet, SetRow, Workout as WorkoutT } from '../types'
import { nextSeq, sgIso, shortOutlet, uuid } from '../util'
import Stepper from '../components/Stepper'
import BellChips from '../components/BellChips'
import StepPill from '../components/StepPill'
import Thumb from '../components/Thumb'
import Picker from './Picker'
import FinishSheet from './FinishSheet'
import TechniqueSheet from './TechniqueSheet'
import { nextSet, type NextSet } from '../nextSet'
import { cardFolded } from '../fold'

type Props = { workoutId: string; onDone: () => void }

export default function Workout({ workoutId, onDone }: Props) {
  const [workout, setWorkout] = useState<WorkoutT | null>(null)
  const [outlet, setOutlet] = useState<Outlet | null>(null)
  const [exercises, setExercises] = useState<Record<string, Exercise>>({})
  const [equipment, setEquipment] = useState<Record<string, Equipment>>({})
  const [sets, setSets] = useState<SetRow[]>([])
  const [lastLines, setLastLines] = useState<Record<string, string>>({})
  const [bellExtras, setBellExtras] = useState<Record<string, number[]>>({})
  const [picking, setPicking] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [techniqueFor, setTechniqueFor] = useState<Exercise | null>(null)
  const [now, setNow] = useState(Date.now())
  // Cards whose every set is ticked fold to one line; a tap pins one open.
  const [pinnedOpen, setPinnedOpen] = useState<string[]>([])

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
    const extras: Record<string, number[]> = {}
    for (const exId of new Set(rows.map((r) => r.exerciseId))) {
      const ex = exMap[exId]
      const eqId = rows.find((r) => r.exerciseId === exId)?.equipmentId
      lines[exId] = formatLast(ex, await lastSession(ex, eqId, workoutId))
      if (ex.equipmentType === 'kettlebell') extras[exId] = await distinctWeights(exId)
    }

    setWorkout(w)
    setOutlet(o ?? null)
    setExercises(exMap)
    setEquipment(Object.fromEntries(eqList.map((e) => [e.id, e])))
    setSets(rows)
    setLastLines(lines)
    setBellExtras(extras)
  }

  // Every change is written straight to the database: there is no Save button.
  function saveRow(row: SetRow) {
    setSets((prev) => prev.map((s) => (s.id === row.id ? row : s)))
    // Ticking a set again lets a card that was tapped open fold once more.
    if (row.completedAt) setPinnedOpen((p) => p.filter((id) => id !== row.exerciseId))
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
    if (ex.equipmentType === 'kettlebell') {
      const extra = await distinctWeights(ex.id)
      setBellExtras((prev) => ({ ...prev, [ex.id]: extra }))
    }
    setSets((prev) => [...prev, ...rows])
    window.setTimeout(() => {
      document.getElementById(`card-${ex.id}`)?.scrollIntoView({ behavior: 'smooth' })
    }, 50)
  }

  // "+ Set" copies the last real row; if only ghosts exist, the last ghost.
  function addSet(exerciseId: string) {
    const rows = sets.filter((s) => s.exerciseId === exerciseId)
    const real = rows.filter((r) => !r.ghost)
    const prev = (real.length > 0 ? real : rows)[(real.length > 0 ? real : rows).length - 1]
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

  function setStep(eq: Equipment, stackStepKg: number) {
    const next = { ...eq, stackStepKg }
    setEquipment((prev) => ({ ...prev, [eq.id]: next }))
    db.equipment.update(eq.id, { stackStepKg })
  }

  function setNotes(notes: string) {
    if (!workout) return
    setWorkout({ ...workout, notes })
    db.workouts.update(workout.id, { notes })
  }

  // Deletes unticked and ghost rows; a workout with nothing ticked is removed entirely.
  async function finish() {
    if (!workout) return
    const discard = sets.filter((s) => !s.completedAt).map((s) => s.id)
    await db.sets.bulkDelete(discard)
    if (sets.length === discard.length) {
      await db.workouts.delete(workout.id)
    } else {
      await db.workouts.update(workout.id, { endedAt: sgIso() })
    }
    onDone()
  }

  if (!workout || !outlet) return null

  const exerciseOrder = [...new Set(sets.map((s) => s.exerciseId))]
  const { done, total } = countSets(sets)
  const up = nextSet(sets)

  // The dock's ✓: same as ticking the row itself.
  function tick(row: SetRow) {
    navigator.vibrate?.(40)
    saveRow({ ...row, ghost: false, completedAt: sgIso() })
  }

  function jumpTo(exerciseId: string) {
    document.getElementById(`card-${exerciseId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <div className="screen workout">
      <header className="workout-header">
        <div className="row">
          <div>
            <div className="header-outlet">{shortOutlet(outlet.name)}</div>
            <div className="header-time">{elapsed(workout.startedAt, now)}</div>
          </div>
          <div className="header-pill">{total === 0 ? '0 sets' : `${done} of ${total} sets`}</div>
        </div>
        <div className="progress" aria-hidden="true">
          <i style={{ width: total === 0 ? '0%' : `${(done / total) * 100}%` }} />
        </div>
      </header>

      {exerciseOrder.map((exId) => {
        const ex = exercises[exId]
        const rows = sets.filter((s) => s.exerciseId === exId)
        const eq = rows[0].equipmentId ? equipment[rows[0].equipmentId] : undefined
        let working = 0
        if (cardFolded(rows, pinnedOpen.includes(exId))) {
          const text = formatLast(ex, rows).replace(/^Last: /, '')
          return (
            <button
              type="button"
              className="card folded"
              key={exId}
              id={`card-${exId}`}
              onClick={() => setPinnedOpen((p) => [...p, exId])}
              aria-label={`${ex.name} done, tap to expand`}
            >
              <Thumb ex={ex} size={44} />
              <span className="folded-body">
                <b>{ex.name}</b>
                <span>{text}</span>
              </span>
              <i className="folded-mark" aria-hidden="true">
                ✓
              </i>
            </button>
          )
        }
        return (
          <section className="card" key={exId} id={`card-${exId}`}>
            <div className="ex-head">
              <Thumb ex={ex} size={64} onClick={() => setTechniqueFor(ex)} />
              <button type="button" className="ex-title" onClick={() => setTechniqueFor(ex)}>
                <h2>{ex.name}</h2>
                <LastLine text={lastLines[exId]} />
              </button>
              {eq && keyedByEquipment(ex) && (
                <StepPill value={weightStep(ex, eq)} onChange={(kg) => setStep(eq, kg)} />
              )}
            </div>
            {ex.note && <div className="ex-note">{ex.note}</div>}
            {rows.map((row) => (
              <SetRowView
                key={row.id}
                row={row}
                ex={ex}
                step={weightStep(ex, eq)}
                bellExtra={bellExtras[exId] ?? []}
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

      <button type="button" className="btn secondary big" onClick={() => setPicking(true)}>
        + Add exercise
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

      <button type="button" className="btn quiet finish" onClick={() => setFinishing(true)}>
        Finish workout
      </button>

      {total > 0 && (
        <UpNextDock
          up={up}
          ex={up ? exercises[up.row.exerciseId] : undefined}
          onTick={() => up && tick(up.row)}
          onJump={() => up && jumpTo(up.row.exerciseId)}
          onFinish={() => setFinishing(true)}
        />
      )}

      <TechniqueSheet ex={techniqueFor} onClose={() => setTechniqueFor(null)} />

      <FinishSheet
        open={finishing}
        onClose={() => setFinishing(false)}
        rows={sets}
        exercises={exercises}
        startedAt={workout.startedAt}
        onFinish={finish}
      />

      {picking && (
        <Picker outlet={outlet} onPick={addExercise} onClose={() => setPicking(false)} />
      )}
    </div>
  )
}

// Fixed to the bottom of the screen: the next unticked set and one big ✓, so the
// thumb never has to find the row. When everything is ticked it becomes Finish.
function UpNextDock({
  up,
  ex,
  onTick,
  onJump,
  onFinish,
}: {
  up: NextSet | null
  ex?: Exercise
  onTick: () => void
  onJump: () => void
  onFinish: () => void
}) {
  const [pop, setPop] = useState(false)
  if (!up || !ex) {
    return (
      <div className="dock done">
        <div className="dock-body">
          <div className="dock-kicker">All sets ticked</div>
          <div className="dock-name">Nice work</div>
        </div>
        <button type="button" className="btn primary dock-finish" onClick={onFinish}>
          Finish
        </button>
      </div>
    )
  }
  const label = up.number === 0 ? 'Warm-up' : `Set ${up.number} of ${up.total}`
  const text = formatLast(ex, [{ ...up.row, isWarmup: false }]).replace(/^Last: /, '')
  const i = text.indexOf(' × ')
  return (
    <div className="dock">
      <button type="button" className="dock-body" onClick={onJump} aria-label={`Scroll to ${ex.name}`}>
        <div className="dock-kicker">Up next · {label}</div>
        <div className="dock-name">{ex.name}</div>
        <div className="dock-meta">
          {i === -1 ? text : (
            <>
              <b>{text.slice(0, i)}</b> × {text.slice(i + 3)}
            </>
          )}
        </div>
      </button>
      <button
        type="button"
        className={`dock-check ${pop ? 'pop' : ''}`}
        aria-label={`Complete ${ex.name} ${label}`}
        onClick={() => {
          setPop(true)
          window.setTimeout(() => setPop(false), 200)
          onTick()
        }}
      >
        ✓
      </button>
    </div>
  )
}

// "Last: 100 kg × 12, 12, 10" with the load in --text and the rest muted.
function LastLine({ text }: { text?: string }) {
  if (!text) return null
  const body = text.replace(/^Last: /, '')
  const i = body.indexOf(' × ')
  if (i === -1) return <div className="last-line">Last {body}</div>
  return (
    <div className="last-line">
      Last <b>{body.slice(0, i)}</b> × {body.slice(i + 3)}
    </div>
  )
}

function SetRowView({
  row,
  ex,
  step,
  bellExtra,
  number,
  onChange,
}: {
  row: SetRow
  ex: Exercise
  step: number
  bellExtra: number[]
  number: number
  onChange: (row: SetRow) => void
}) {
  const [pop, setPop] = useState(false)
  const timed = ex.loadMode === 'timed'
  const kettlebell = ex.equipmentType === 'kettlebell'
  const bodyweight = ex.loadMode === 'bodyweight_plus'
  const noLoad = timed && ex.equipmentType === 'bodyweight' // e.g. plank
  const done = !!row.completedAt

  // Any edit on a ghost row makes it real without completing it.
  function edit(patch: Partial<SetRow>) {
    onChange({ ...row, ...patch, ghost: false })
  }

  function toggleDone() {
    if (done) {
      onChange({ ...row, completedAt: undefined })
    } else {
      navigator.vibrate?.(40)
      setPop(true)
      window.setTimeout(() => setPop(false), 200)
      onChange({ ...row, ghost: false, completedAt: sgIso() })
    }
  }

  const cls = ['set-row', done ? 'done' : '', row.isWarmup ? 'warmup' : '', row.ghost ? 'ghost' : '']
  return (
    <div className={cls.join(' ').trim()}>
      <button
        type="button"
        className="badge"
        onClick={() => edit({ isWarmup: !row.isWarmup })}
        aria-label="Toggle warm-up"
      >
        {row.isWarmup ? 'W' : number}
      </button>
      <div className="set-controls">
        {!noLoad &&
          (kettlebell ? (
            <BellChips
              value={row.weightKg}
              extra={bellExtra}
              onChange={(kg) => edit({ weightKg: kg })}
            />
          ) : (
            <Stepper
              value={row.weightKg ?? 0}
              step={step}
              unit={loadUnit(ex)}
              prefix={bodyweight ? '+' : ''}
              onChange={(v) => edit({ weightKg: v ?? 0 })}
            />
          ))}
        {timed ? (
          <Stepper
            value={row.durationSec ?? 30}
            step={5}
            unit="sec"
            onChange={(v) => edit({ durationSec: v ?? 0 })}
          />
        ) : (
          <Stepper
            value={row.reps ?? 10}
            step={1}
            unit="reps"
            onChange={(v) => edit({ reps: v ?? 0 })}
          />
        )}
      </div>
      <button
        type="button"
        className={`check ${pop ? 'pop' : ''}`}
        onClick={toggleDone}
        aria-label={done ? 'Mark set not done' : 'Complete set'}
        aria-pressed={done}
      >
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
