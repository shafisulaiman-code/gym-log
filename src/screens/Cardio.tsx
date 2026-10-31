import { useEffect, useState, type ReactNode } from 'react'
import { cardioModalities, db } from '../db'
import { applyShared, isOverridden, prefillFrom, timeline } from '../cardio'
import type { CardioModality, CardioSession, Interval } from '../types'
import { fmt, getLastOutlet, sgIso, uuid } from '../util'
import Stepper from '../components/Stepper'

type Props = { onDone: () => void }

const LABELS: Record<CardioModality, string> = {
  treadmill_z2: 'Zone 2',
  treadmill_4x4: '4x4',
  bike: 'Bike',
}

const RPE_CHOICES = [6, 7, 8, 9, 10]
const DEFAULT_4X4 = { speedKph: 6, inclinePct: 10 }

type Form = Omit<CardioSession, 'id' | 'workoutId'>
type SharedKey = 'speedKph' | 'inclinePct'

function seedDefaults(modality: CardioModality) {
  return (cardioModalities.find((m) => m.id === modality)?.defaults ?? {}) as Record<string, number | undefined>
}

function defaultsFor(modality: CardioModality): Form {
  const d = seedDefaults(modality)
  const form: Form = { modality, durationMin: d.durationMin ?? 30 }
  if (modality === 'treadmill_z2') {
    form.inclinePct = d.inclinePct
    form.speedKph = d.speedKph
  }
  if (modality === 'treadmill_4x4') {
    form.speedKph = DEFAULT_4X4.speedKph
    form.inclinePct = DEFAULT_4X4.inclinePct
    form.intervals = Array.from({ length: d.intervals ?? 4 }, () => ({
      workMin: d.workMin ?? 4,
      speedKph: DEFAULT_4X4.speedKph,
      inclinePct: DEFAULT_4X4.inclinePct,
    }))
  }
  return form
}

export default function Cardio({ onDone }: Props) {
  const [form, setForm] = useState<Form | null>(null)
  // Which interval cells are expanded into their own stepper: "i:speedKph".
  const [editing, setEditing] = useState<Set<string>>(new Set())

  useEffect(() => {
    pickModality('treadmill_z2')
  }, [])

  // Prefill the plan from the last session of the same modality, else seed defaults.
  async function pickModality(modality: CardioModality) {
    const sessions = await db.cardio_sessions.where('modality').equals(modality).toArray()
    let latest: CardioSession | undefined
    let latestStart = ''
    for (const s of sessions) {
      const w = await db.workouts.get(s.workoutId)
      if (w && w.startedAt > latestStart) {
        latest = s
        latestStart = w.startedAt
      }
    }
    setEditing(new Set())
    setForm(latest ? prefillFrom(latest) : defaultsFor(modality))
  }

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f))
  }

  // Shared speed/incline: moves every interval that still had the old value.
  function setShared(key: SharedKey, value: number | undefined) {
    setForm((f) => {
      if (!f) return f
      const next: Form = { ...f, [key]: value }
      if (f.intervals) next.intervals = applyShared(f.intervals, key, f[key], value)
      return next
    })
  }

  function setIntervalRow(i: number, patch: Partial<Interval>) {
    if (!form?.intervals) return
    set(
      'intervals',
      form.intervals.map((iv, j) => (j === i ? { ...iv, ...patch } : iv)),
    )
  }

  function toggleEdit(i: number, key: SharedKey) {
    setEditing((prev) => {
      const next = new Set(prev)
      const id = `${i}:${key}`
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function save() {
    if (!form) return
    const end = new Date()
    const start = new Date(end.getTime() - form.durationMin * 60000)
    const outletId = getLastOutlet() ?? (await db.outlets.toCollection().first())!.id
    const workoutId = uuid()
    await db.workouts.add({
      id: workoutId,
      startedAt: sgIso(start),
      endedAt: sgIso(end),
      outletId,
      type: 'cardio',
      notes: form.notes || undefined,
    })
    await db.cardio_sessions.add({ ...form, id: uuid(), workoutId })
    onDone()
  }

  if (!form) return null
  const is4x4 = form.modality === 'treadmill_4x4'
  const d = seedDefaults('treadmill_4x4')
  const tl = is4x4 ? timeline(form.durationMin, d.workMin ?? 4, d.restMin ?? 3, form.intervals?.length ?? 4) : null

  return (
    <div className="screen">
      <header className="simple-header">
        <button type="button" className="back" onClick={onDone} aria-label="Back">
          ‹
        </button>
        <h1>Cardio</h1>
      </header>

      <div className="seg" role="radiogroup" aria-label="Type">
        {(Object.keys(LABELS) as CardioModality[]).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={form.modality === m}
            className={form.modality === m ? 'on' : ''}
            onClick={() => pickModality(m)}
          >
            {LABELS[m]}
          </button>
        ))}
      </div>

      {is4x4 && tl && (
        <div className="card">
          <div className="lbl">Session · {fmt(form.durationMin)} min</div>
          <div className="timeline" aria-hidden="true">
            {tl.segments.map((s, i) => (
              <i key={i} className={s.kind} style={{ flex: Math.max(s.min, 0.01) }} />
            ))}
          </div>
          <div className="tl-lbl">
            <span>
              warm-up <b>{Math.round(tl.warmupMin)}</b>
            </span>
            <span>
              work <b>{fmt(d.workMin ?? 4)}</b> · rest <b>{fmt(d.restMin ?? 3)}</b> · ×{form.intervals?.length ?? 4}
            </span>
            <span>
              cool <b>{Math.round(tl.coolMin)}</b>
            </span>
          </div>
        </div>
      )}

      <div className="card">
        <Row label="Duration">
          <Stepper value={form.durationMin} step={1} unit="min" onChange={(v) => set('durationMin', v ?? 0)} />
        </Row>
        {form.modality === 'treadmill_z2' && (
          <>
            <Row label="Incline">
              <Stepper value={form.inclinePct} step={0.5} unit="%" optional start={12} onChange={(v) => set('inclinePct', v)} />
            </Row>
            <Row label="Speed">
              <Stepper value={form.speedKph} step={0.1} unit="km/h" optional start={5} onChange={(v) => set('speedKph', v)} />
            </Row>
          </>
        )}
      </div>

      {is4x4 && (
        <>
          <div className="card">
            <div className="lbl">Work intervals</div>
            <Row label="Speed">
              <Stepper value={form.speedKph} step={0.1} unit="km/h" optional start={6} onChange={(v) => setShared('speedKph', v)} />
            </Row>
            <Row label="Incline">
              <Stepper value={form.inclinePct} step={0.5} unit="%" optional start={10} onChange={(v) => setShared('inclinePct', v)} />
            </Row>
          </div>

          <div className="card">
            <div className="ivl-grid">
              <div className="h">#</div>
              <div className="h">Speed</div>
              <div className="h">Incl</div>
              <div className="h">Peak HR</div>
              {form.intervals?.map((iv, i) => (
                <IntervalRow
                  key={i}
                  i={i}
                  iv={iv}
                  shared={{ speedKph: form.speedKph, inclinePct: form.inclinePct }}
                  editing={editing}
                  onToggle={(key) => toggleEdit(i, key)}
                  onChange={(patch) => setIntervalRow(i, patch)}
                />
              ))}
            </div>
            <div className="hint">Tap a speed or incline to change that interval only</div>
          </div>
        </>
      )}

      <div className="card">
        <Row label="Avg HR">
          <Stepper value={form.avgHr} step={1} unit="bpm" optional start={130} onChange={(v) => set('avgHr', v)} />
        </Row>
        <Row label="Max HR">
          <Stepper value={form.maxHr} step={1} unit="bpm" optional start={150} onChange={(v) => set('maxHr', v)} />
        </Row>
        <div className="form-row">
          <span>RPE</span>
          <div className="chip-row" role="radiogroup" aria-label="RPE" style={{ flexWrap: 'nowrap' }}>
            {RPE_CHOICES.map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={form.rpe === n}
                className={`chip ${form.rpe === n ? 'selected' : ''}`}
                style={{ flex: 1, minWidth: 0, padding: 0 }}
                onClick={() => set('rpe', form.rpe === n ? undefined : n)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      <label className="field">
        <span>Note</span>
        <textarea rows={2} value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} placeholder="Optional" />
      </label>

      <button type="button" className="btn primary big" onClick={save}>
        Save cardio
      </button>
    </div>
  )
}

function IntervalRow({
  i,
  iv,
  shared,
  editing,
  onToggle,
  onChange,
}: {
  i: number
  iv: Interval
  shared: { speedKph?: number; inclinePct?: number }
  editing: Set<string>
  onToggle: (key: SharedKey) => void
  onChange: (patch: Partial<Interval>) => void
}) {
  const cell = (key: SharedKey, unit: string, step: number, start: number) => {
    const open = editing.has(`${i}:${key}`)
    const ovr = isOverridden(iv, key, shared[key])
    if (open) {
      return (
        <Stepper
          value={iv[key]}
          step={step}
          unit={unit}
          optional
          start={start}
          onChange={(v) => onChange({ [key]: v })}
        />
      )
    }
    return (
      <button
        type="button"
        className={`inh ${ovr ? 'ovr' : ''}`}
        onClick={() => onToggle(key)}
        aria-label={`Interval ${i + 1} ${key === 'speedKph' ? 'speed' : 'incline'}`}
      >
        {iv[key] === undefined ? '—' : fmt(iv[key]!)}
        <small>{unit}</small>
      </button>
    )
  }
  return (
    <>
      <div className="idx">{i + 1}</div>
      {cell('speedKph', 'km/h', 0.1, shared.speedKph ?? 6)}
      {cell('inclinePct', '%', 0.5, shared.inclinePct ?? 10)}
      <Stepper value={iv.peakHr} step={1} unit="bpm" optional start={160} onChange={(v) => onChange({ peakHr: v })} />
    </>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="form-row">
      <span>{label}</span>
      {children}
    </div>
  )
}
