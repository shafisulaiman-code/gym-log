import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { db } from '../db'
import { EMPTY_COACH } from '../coachStore'
import { keyOf, lightWeekRunning, sessionsFor, stallOf, suggestNext, type Suggestion } from '../coach'
import { loadAll, type GymData } from '../export'
import {
  countSets,
  distinctWeights,
  formatLast,
  getOrCreateEquipment,
  keyedByEquipment,
  knownRows,
  lastSession,
  loadUnit,
  prefillRows,
  undoPlan,
  weightStep,
} from '../history'
import type { CoachTag, Equipment, Exercise, Outlet, SetRow, Workout as WorkoutT } from '../types'
import { nextSeq, sgIso, shortOutlet, uuid } from '../util'
import Stepper from '../components/Stepper'
import BellChips from '../components/BellChips'
import StepPill from '../components/StepPill'
import Thumb from '../components/Thumb'
import NudgeLine from './NudgeLine'
import Picker from './Picker'
import FinishSheet from './FinishSheet'
import TechniqueSheet from './TechniqueSheet'
import { nextSet, type NextSet } from '../nextSet'
import { formatRest, restState, REST_AFTER_EXERCISE, type Rest } from '../rest'
import { cardFolded } from '../fold'

type Props = { workoutId: string; onDone: () => void }

// The suggestion states that carry a target and a tap (hold and text are plain lines).
type Tappable = Extract<Suggestion, { tag: CoachTag }>

export default function Workout({ workoutId, onDone }: Props) {
  const [workout, setWorkout] = useState<WorkoutT | null>(null)
  const [outlet, setOutlet] = useState<Outlet | null>(null)
  const [exercises, setExercises] = useState<Record<string, Exercise>>({})
  const [equipment, setEquipment] = useState<Record<string, Equipment>>({})
  const [sets, setSets] = useState<SetRow[]>([])
  // The raw tables, read once on load: the nudge lines and the light-week list come from it.
  const [data, setData] = useState<GymData | null>(null)
  const [lastLines, setLastLines] = useState<Record<string, string>>({})
  const [bellExtras, setBellExtras] = useState<Record<string, number[]>>({})
  const [picking, setPicking] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [techniqueFor, setTechniqueFor] = useState<Exercise | null>(null)
  const [now, setNow] = useState(Date.now())
  // Cards whose every set is ticked fold to one line; a tap pins one open.
  const [pinnedOpen, setPinnedOpen] = useState<string[]>([])
  const coach = data?.coach ?? EMPTY_COACH
  const undoing = useRef(false) // a second tap on the taken line while the first undo is still running

  // Today's nudge per exercise. History does not change mid-workout, so this only
  // recomputes when the exercises, their equipment or the bell sizes change.
  const headSig = [...new Set(sets.map((s) => s.exerciseId))]
    .map((id) => `${id}:${sets.find((s) => s.exerciseId === id)?.equipmentId ?? ''}`)
    .join(',')
  const nudges = useMemo(() => {
    const out: Record<string, { suggestion: Suggestion; lastRows: SetRow[] }> = {}
    if (!data) return out
    const running = !!lightWeekRunning(data.coach, sgIso())
    for (const id of new Set(sets.map((s) => s.exerciseId))) {
      const ex = exercises[id]
      const first = sets.find((s) => s.exerciseId === id)
      if (!ex || !first) continue
      const all = sessionsFor(data, keyOf(ex, first))
      const sessions = all.filter((x) => !x.light)
      const suggestion = suggestNext({
        ex,
        eq: first.equipmentId ? equipment[first.equipmentId] : undefined,
        bells: bellExtras[id] ?? [],
        sessions,
        lightWeekRunning: running,
        stall: stallOf(ex, all, data.coach.lightWeeks),
      })
      if (!suggestion) continue
      const lastSess = sessions[sessions.length - 1] ?? all[all.length - 1]
      out[id] = { suggestion, lastRows: lastSess?.rows ?? [] }
    }
    return out
    // `sets` is read through headSig: only the first row's exercise and equipment matter.
  }, [data, exercises, equipment, bellExtras, headSig])

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    // Timers are throttled while the screen is off; catch up on the first frame after unlock.
    const onVisible = () => {
      if (document.visibilityState === 'visible') setNow(Date.now())
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(t)
      document.removeEventListener('visibilitychange', onVisible)
    }
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
    const [o, exList, eqList, rowsRaw, all] = await Promise.all([
      db.outlets.get(w.outletId),
      db.exercises.toArray(),
      db.equipment.toArray(),
      db.sets.where('workoutId').equals(workoutId).toArray(),
      loadAll(),
    ])
    const exMap = Object.fromEntries(exList.map((e) => [e.id, e]))
    const rows = knownRows(rowsRaw, exMap).sort((a, b) => a.seq - b.seq)

    const lines: Record<string, string> = {}
    const extras: Record<string, number[]> = {}
    for (const exId of new Set(rows.map((r) => r.exerciseId))) {
      const ex = exMap[exId]
      const eqId = rows.find((r) => r.exerciseId === exId)?.equipmentId
      lines[exId] = formatLast(ex, await lastSession(ex, eqId, workoutId, all.coach.lightWeeks))
      if (ex.equipmentType === 'kettlebell') extras[exId] = await distinctWeights(exId)
    }

    setWorkout(w)
    setData(all)
    setOutlet(o ?? null)
    setExercises(exMap)
    setEquipment(Object.fromEntries(eqList.map((e) => [e.id, e])))
    setSets(rows)
    setLastLines(lines)
    setBellExtras(extras)
  }

  // Every change is written straight to the database: there is no Save button.
  function saveRow(row: SetRow) {
    // Ticking a set again lets a card that was tapped open fold once more; rating a
    // finished exercise (RPE or pain chips) saves a row that was already ticked.
    const justTicked = !!row.completedAt && !sets.find((s) => s.id === row.id)?.completedAt
    setSets((prev) => prev.map((s) => (s.id === row.id ? row : s)))
    if (justTicked) setPinnedOpen((p) => p.filter((id) => id !== row.exerciseId))
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

    const last = await lastSession(ex, eq?.id, workout.id, coach.lightWeeks)
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

  // The nudge tap: every ghost working row takes the target and the coach tag, and stays a
  // ghost. A light week with fewer sets drops the trailing ghost working rows.
  function applySuggestion(exerciseId: string, s: Tappable) {
    const timed = exercises[exerciseId]?.loadMode === 'timed'
    const ghosts = sets.filter((r) => r.exerciseId === exerciseId && r.ghost && !r.isWarmup)
    const keep = s.state === 'light' ? ghosts.slice(0, s.sets) : ghosts
    const dropped = new Set(ghosts.slice(keep.length).map((r) => r.id))
    const put = keep.map(
      (r): SetRow => ({
        ...r,
        weightKg: s.w,
        ...(timed ? { durationSec: s.count } : { reps: s.count }),
        coach: s.tag,
      }),
    )
    const byId = new Map(put.map((r) => [r.id, r]))
    setSets((prev) => prev.filter((r) => !dropped.has(r.id)).map((r) => byId.get(r.id) ?? r))
    db.sets.bulkPut(put)
    if (dropped.size > 0) db.sets.bulkDelete([...dropped])
  }

  // Back to last time's working rows; warm-ups and rows the user made real stay (see undoPlan).
  async function undoSuggestion(exerciseId: string) {
    if (undoing.current) return
    const ex = exercises[exerciseId]
    const mine = sets.filter((r) => r.exerciseId === exerciseId)
    if (!ex || mine.length === 0) return
    undoing.current = true
    try {
      const eq = mine[0].equipmentId ? equipment[mine[0].equipmentId] : undefined
      const last = await lastSession(ex, eq?.id, workoutId, coach.lightWeeks)
      const { remove, add } = undoPlan(mine, prefillRows(ex, eq, workoutId, last))
      const gone = new Set(remove.map((r) => r.id))
      setSets((prev) => [...prev.filter((r) => !gone.has(r.id)), ...add].sort((a, b) => a.seq - b.seq))
      await db.sets.bulkDelete([...gone])
      await db.sets.bulkAdd(add)
    } finally {
      undoing.current = false
    }
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
  const rest = restState(sets, now)

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
        // Hidden once any set of this exercise is ticked, and when no ghost row is left to rewrite.
        const taken = rows.some((r) => r.ghost && r.coach)
        const found = nudges[exId]
        const nudge =
          found &&
          !rows.some((r) => r.completedAt) &&
          (!isTap(found.suggestion) || taken || rows.some((r) => r.ghost && !r.isWarmup))
            ? found
            : undefined
        const target = nudge?.suggestion
        const onNudgeTap =
          target && isTap(target) ? (taken ? () => undoSuggestion(exId) : () => applySuggestion(exId, target)) : undefined
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
            {nudge && (
              <NudgeLine
                ex={ex}
                suggestion={nudge.suggestion}
                lastRows={nudge.lastRows}
                taken={taken}
                onTap={onNudgeTap}
              />
            )}
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
          rest={rest}
          onTick={() => up && tick(up.row)}
          onJump={() => up && jumpTo(up.row.exerciseId)}
          onFinish={() => setFinishing(true)}
          onAddExercise={() => setPicking(true)}
          onRate={(patch) => rest && saveRow({ ...rest.row, ...patch })}
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
  rest,
  onTick,
  onJump,
  onFinish,
  onAddExercise,
  onRate,
}: {
  up: NextSet | null
  ex?: Exercise
  rest: Rest | null
  onTick: () => void
  onJump: () => void
  onFinish: () => void
  onAddExercise: () => void
  onRate: (patch: Pick<SetRow, 'rpe' | 'painFlag'>) => void
}) {
  const [pop, setPop] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const drinkUp = rest?.target === REST_AFTER_EXERCISE
  const kind = `${!up || !ex ? 'done' : 'up'}${drinkUp ? '-drink' : ''}`

  // The page's bottom padding follows the dock's real height, which changes between states.
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const root = document.documentElement
    const write = () => root.style.setProperty('--dock-h', `${el.offsetHeight + 24}px`)
    write()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(write)
    ro.observe(el)
    return () => ro.disconnect()
  }, [kind])
  useEffect(
    () => () => {
      document.documentElement.style.removeProperty('--dock-h')
    },
    [],
  )

  const chips = drinkUp && rest && (
    <div className="chip-row scroll dock-pill" aria-label="How hard was that exercise">
      {[6, 7, 8, 9, 10].map((n) => {
        const on = rest.row.rpe === n
        return (
          <button
            key={n}
            type="button"
            className={`chip${on ? ' selected' : ''}`}
            aria-pressed={on}
            aria-label={`Effort ${n} out of 10`}
            onClick={() => onRate({ rpe: on ? undefined : n })}
          >
            {n}
          </button>
        )
      })}
      <i className="dock-pill-sep" aria-hidden="true" />
      {(['back', 'knee'] as const).map((p) => {
        const on = rest.row.painFlag === p
        return (
          <button
            key={p}
            type="button"
            className={`chip warn${on ? ' selected' : ''}`}
            aria-pressed={on}
            onClick={() => onRate({ painFlag: on ? undefined : p })}
          >
            {p === 'back' ? 'Back' : 'Knee'}
          </button>
        )
      })}
    </div>
  )

  if ((!up || !ex) && rest && drinkUp) {
    return (
      <div className="dock-stack" ref={rootRef}>
        {chips}
        <div className={`dock resting${rest.over ? ' over' : ''}`}>
          <div className="dock-body">
            <div className="dock-kicker">{rest.over ? 'Rest · over' : 'Rest · drink up'}</div>
            <div className="dock-time num">{formatRest(rest.remaining)}</div>
            <div className="dock-meta">Then add the next exercise</div>
          </div>
          <button type="button" className="btn primary dock-add" onClick={onAddExercise}>
            + Exercise
          </button>
        </div>
      </div>
    )
  }
  if (!up || !ex) {
    return (
      <div className="dock-stack" ref={rootRef}>
        <div className="dock done">
          <div className="dock-body">
            <div className="dock-kicker">All sets ticked</div>
            <div className="dock-name">Nice work</div>
          </div>
          <button type="button" className="btn primary dock-finish" onClick={onFinish}>
            Finish
          </button>
        </div>
      </div>
    )
  }
  const label = up.number === 0 ? 'Warm-up' : `Set ${up.number} of ${up.total}`
  const text = formatLast(ex, [{ ...up.row, isWarmup: false }]).replace(/^Last: /, '')
  const i = text.indexOf(' × ')
  const load =
    i === -1 ? (
      text
    ) : (
      <>
        <b>{text.slice(0, i)}</b> × {text.slice(i + 3)}
      </>
    )
  const restLabel = up.number === 0 ? 'warm-up' : `set ${up.number}`
  return (
    <div className="dock-stack" ref={rootRef}>
      {chips}
      <div className={`dock${rest ? ' resting' : ''}${rest?.over ? ' over' : ''}`}>
        <button type="button" className="dock-body" onClick={onJump} aria-label={`Scroll to ${ex.name}`}>
          {rest ? (
            <>
              <div className="dock-kicker">
                {rest.over ? 'Rest · over' : drinkUp ? 'Rest · drink up' : 'Rest'}
              </div>
              <div className="dock-time num">{formatRest(rest.remaining)}</div>
              <div className="dock-meta">
                Next · {ex.name} {restLabel} · {load}
              </div>
            </>
          ) : (
            <>
              <div className="dock-kicker">Up next · {label}</div>
              <div className="dock-name">{ex.name}</div>
              <div className="dock-meta">{load}</div>
            </>
          )}
        </button>
        <button
          type="button"
          className={`dock-check${pop ? ' pop' : ''}${rest ? ' ring' : ''}`}
          style={rest ? ({ '--ring': rest.over ? 1 : rest.remaining / rest.target } as CSSProperties) : undefined}
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
    </div>
  )
}

// "Last: 100 kg × 12, 12, 10" with the load in --text and the rest muted.
function LastLine({ text }: { text?: string }) {
  if (!text) return null
  let body = text.replace(/^Last: /, '')
  const m = body.match(/ · (back|knee)$/)
  if (m) body = body.slice(0, m.index)
  const pain = m && (
    <>
      {' · '}
      <span className="pain">{m[1]}</span>
    </>
  )
  const i = body.indexOf(' × ')
  if (i === -1) {
    return (
      <div className="last-line">
        Last {body}
        {pain}
      </div>
    )
  }
  return (
    <div className="last-line">
      Last <b>{body.slice(0, i)}</b> × {body.slice(i + 3)}
      {pain}
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

  const cls = [
    'set-row',
    done ? 'done' : '',
    row.isWarmup ? 'warmup' : '',
    row.ghost ? 'ghost' : '',
    row.ghost && row.coach ? 'coached' : '',
  ]
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

function isTap(s: Suggestion): s is Tappable {
  return s.state !== 'hold' && s.state !== 'text'
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
