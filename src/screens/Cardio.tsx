import { useEffect, useState, type ReactNode } from 'react'
import { cardioModalities, db } from '../db'
import type { CardioModality, CardioSession, Interval } from '../types'
import { getLastOutlet, sgIso, uuid } from '../util'
import Stepper from '../components/Stepper'

type Props = { onDone: () => void }

const LABELS: Record<CardioModality, string> = {
  treadmill_z2: 'Zone 2',
  treadmill_4x4: '4x4',
  bike: 'Bike',
}

type Form = Omit<CardioSession, 'id' | 'workoutId'>

function defaultsFor(modality: CardioModality): Form {
  const d = cardioModalities.find((m) => m.id === modality)?.defaults as Record<string, number | undefined>
  const form: Form = { modality, durationMin: d?.durationMin ?? 30 }
  if (modality === 'treadmill_z2') {
    form.inclinePct = d.inclinePct
    form.speedKph = d.speedKph
  }
  if (modality === 'treadmill_4x4') {
    form.intervals = Array.from({ length: d.intervals ?? 4 }, () => ({
      workMin: d.workMin ?? 4,
      speedKph: 6,
      inclinePct: 10,
    }))
  }
  return form
}

export default function Cardio({ onDone }: Props) {
  const [form, setForm] = useState<Form | null>(null)

  useEffect(() => {
    pickModality('treadmill_z2')
  }, [])

  // Prefill from the last session of the same modality, else seed defaults.
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
    if (latest) {
      const { id: _id, workoutId: _w, notes: _n, ...rest } = latest
      setForm(rest)
    } else {
      setForm(defaultsFor(modality))
    }
  }

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f))
  }

  function setIntervalRow(i: number, patch: Partial<Interval>) {
    if (!form?.intervals) return
    set(
      'intervals',
      form.intervals.map((iv, j) => (j === i ? { ...iv, ...patch } : iv)),
    )
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
  const treadmill = form.modality !== 'bike'

  return (
    <div className="screen">
      <header className="simple-header">
        <button type="button" className="btn secondary" onClick={onDone}>
          Back
        </button>
        <h1>Cardio</h1>
      </header>

      <div className="chip-row">
        {(Object.keys(LABELS) as CardioModality[]).map((m) => (
          <button
            key={m}
            type="button"
            className={`chip wide-chip ${form.modality === m ? 'selected' : ''}`}
            onClick={() => pickModality(m)}
          >
            {LABELS[m]}
          </button>
        ))}
      </div>

      <Row label="Duration">
        <Stepper value={form.durationMin} step={1} unit="min" onChange={(v) => set('durationMin', v ?? 0)} />
      </Row>
      {treadmill && form.modality === 'treadmill_z2' && (
        <>
          <Row label="Incline">
            <Stepper value={form.inclinePct} step={0.5} unit="%" optional start={12} onChange={(v) => set('inclinePct', v)} />
          </Row>
          <Row label="Speed">
            <Stepper value={form.speedKph} step={0.1} unit="km/h" optional start={5} onChange={(v) => set('speedKph', v)} />
          </Row>
        </>
      )}
      <Row label="Avg HR">
        <Stepper value={form.avgHr} step={1} unit="bpm" optional start={130} onChange={(v) => set('avgHr', v)} />
      </Row>
      <Row label="Max HR">
        <Stepper value={form.maxHr} step={1} unit="bpm" optional start={150} onChange={(v) => set('maxHr', v)} />
      </Row>

      {form.modality === 'treadmill_4x4' && form.intervals && (
        <div className="intervals">
          <h3>Intervals</h3>
          {form.intervals.map((iv, i) => (
            <div className="card" key={i}>
              <div className="interval-title">Interval {i + 1}</div>
              <div className="interval-grid">
                <Stepper value={iv.speedKph} step={0.1} unit="km/h" optional start={6} onChange={(v) => setIntervalRow(i, { speedKph: v })} />
                <Stepper value={iv.inclinePct} step={0.5} unit="%" optional start={10} onChange={(v) => setIntervalRow(i, { inclinePct: v })} />
                <Stepper value={iv.peakHr} step={1} unit="peak bpm" optional start={160} onChange={(v) => setIntervalRow(i, { peakHr: v })} />
              </div>
            </div>
          ))}
        </div>
      )}

      <Row label="RPE (optional)">
        <Stepper value={form.rpe} step={1} unit="/10" optional start={7} onChange={(v) => set('rpe', v === undefined ? undefined : Math.min(10, v))} />
      </Row>

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

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="form-row">
      <span>{label}</span>
      {children}
    </div>
  )
}
