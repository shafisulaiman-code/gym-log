import { useEffect, useState } from 'react'
import { db, findActiveWorkout } from '../db'
import { exportJson } from '../export'
import type { Outlet, Workout } from '../types'
import { getLastOutlet, minutesBetween, setLastOutlet, sgIso, shortOutlet, uuid } from '../util'

type Props = {
  onOpenWorkout: (workoutId: string) => void
  onCardio: () => void
  onBodyweight: () => void
}

type PastRow = { workout: Workout; label: string; detail: string }

const CARDIO_LABELS: Record<string, string> = {
  treadmill_z2: 'Zone 2',
  treadmill_4x4: '4x4',
  bike: 'Bike',
}

export default function Home({ onOpenWorkout, onCardio, onBodyweight }: Props) {
  const [outlets, setOutlets] = useState<Outlet[]>([])
  const [outletId, setOutletId] = useState('')
  const [active, setActive] = useState<Workout | undefined>()
  const [past, setPast] = useState<PastRow[]>([])
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const [os, workouts, sets, cardio, act] = await Promise.all([
      db.outlets.toArray(),
      db.workouts.orderBy('startedAt').reverse().toArray(),
      db.sets.toArray(),
      db.cardio_sessions.toArray(),
      findActiveWorkout(),
    ])
    const name = (id: string) => shortOutlet(os.find((o) => o.id === id)?.name ?? id)

    const rows: PastRow[] = workouts
      .filter((w) => w.endedAt)
      .slice(0, 30)
      .map((w) => {
        const date = w.startedAt.slice(0, 10)
        const mins = minutesBetween(w.startedAt, w.endedAt!)
        if (w.type === 'cardio') {
          const c = cardio.find((x) => x.workoutId === w.id)
          return {
            workout: w,
            label: `${date} · Cardio`,
            detail: `${CARDIO_LABELS[c?.modality ?? ''] ?? ''} · ${c?.durationMin ?? mins} min`,
          }
        }
        const exCount = new Set(sets.filter((s) => s.workoutId === w.id).map((s) => s.exerciseId)).size
        return {
          workout: w,
          label: `${date} · ${name(w.outletId)}`,
          detail: `${exCount} exercise${exCount === 1 ? '' : 's'} · ${mins} min`,
        }
      })

    const remembered = getLastOutlet()
    const fallback = workouts[0]?.outletId ?? os[0]?.id ?? ''
    setOutlets(os)
    setOutletId(os.some((o) => o.id === remembered) ? remembered! : fallback)
    setActive(act)
    setPast(rows)
  }

  function chooseOutlet(id: string) {
    setOutletId(id)
    setLastOutlet(id)
  }

  async function start() {
    if (active) {
      onOpenWorkout(active.id)
      return
    }
    const id = uuid()
    await db.workouts.add({ id, startedAt: sgIso(), outletId, type: 'strength' })
    setLastOutlet(outletId)
    onOpenWorkout(id)
  }

  async function doExport() {
    setExporting(true)
    try {
      await exportJson()
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="screen">
      <h1>Gym Log</h1>

      <label className="field">
        <span>Outlet</span>
        <select value={outletId} onChange={(e) => chooseOutlet(e.target.value)} disabled={!!active}>
          {outlets.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>

      <button type="button" className="btn primary huge" onClick={start}>
        {active ? 'Resume workout' : 'Start workout'}
      </button>

      <div className="card-actions">
        <button type="button" className="btn secondary" onClick={onCardio}>
          Cardio
        </button>
        <button type="button" className="btn secondary" onClick={onBodyweight}>
          Bodyweight
        </button>
      </div>

      <h3>Past workouts</h3>
      {past.length === 0 ? (
        <p className="muted">Nothing logged yet.</p>
      ) : (
        <ul className="history">
          {past.map((p) => (
            <li key={p.workout.id}>
              <span>{p.label}</span>
              <span className="muted">{p.detail}</span>
            </li>
          ))}
        </ul>
      )}

      <button type="button" className="btn secondary wide" onClick={doExport} disabled={exporting}>
        {exporting ? 'Exporting…' : 'Export JSON'}
      </button>
    </div>
  )
}
