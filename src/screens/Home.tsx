import { useEffect, useRef, useState } from 'react'
import { db, findActiveWorkout } from '../db'
import ExportSheet from './ExportSheet'
import AddOutletSheet from './AddOutletSheet'
import type { Outlet, Workout } from '../types'
import { nearestOutlet, type LatLng } from '../geo'
import { getLastOutlet, minutesBetween, setLastOutlet, sgIso, shortOutlet, uuid } from '../util'

type Props = {
  onOpenWorkout: (workoutId: string) => void
  onCardio: () => void
  onBodyweight: () => void
}

type PastRow = { workout: Workout; title: string; sub: string; dur: string }

const CARDIO_LABELS: Record<string, string> = {
  treadmill_z2: 'Zone 2',
  treadmill_4x4: '4x4',
  bike: 'Bike',
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// "Sat 31 Oct" from an ISO date or timestamp.
export function shortDate(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso)
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`
}

export default function Home({ onOpenWorkout, onCardio, onBodyweight }: Props) {
  const [outlets, setOutlets] = useState<Outlet[]>([])
  const [outletId, setOutletId] = useState('')
  const [active, setActive] = useState<Workout | undefined>()
  const [past, setPast] = useState<PastRow[]>([])
  const [exporting, setExporting] = useState(false)
  const [here, setHere] = useState<LatLng | null>(null)
  const [nearId, setNearId] = useState<string | null>(null)
  const [addingGym, setAddingGym] = useState(false)
  // Once Shafi taps an outlet himself, the suggestion never overrides it.
  const touched = useRef(false)

  useEffect(() => {
    load()
    // One low-power fix, happy with anything from the last five minutes. Any
    // failure (denied, offline GPS, desktop) just means no suggestion.
    navigator.geolocation?.getCurrentPosition(
      (pos) => setHere({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { maximumAge: 300_000, timeout: 8_000, enableHighAccuracy: false },
    )
  }, [])

  // Preselect the outlet you are standing in, unless a workout is already open
  // there or you have chosen one by hand.
  useEffect(() => {
    if (!here || outlets.length === 0) return
    const near = nearestOutlet(outlets, here)
    setNearId(near?.outlet.id ?? null)
    if (near && !active && !touched.current) setOutletId(near.outlet.id)
  }, [here, outlets, active])

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
        const date = shortDate(w.startedAt)
        const mins = minutesBetween(w.startedAt, w.endedAt!)
        if (w.type === 'cardio') {
          const c = cardio.find((x) => x.workoutId === w.id)
          return {
            workout: w,
            title: `${date} · Cardio`,
            sub: CARDIO_LABELS[c?.modality ?? ''] ?? '',
            dur: `${c?.durationMin ?? mins} min`,
          }
        }
        const exCount = new Set(sets.filter((s) => s.workoutId === w.id).map((s) => s.exerciseId)).size
        return {
          workout: w,
          title: `${date} · ${name(w.outletId)}`,
          sub: `${exCount} exercise${exCount === 1 ? '' : 's'}`,
          dur: `${mins} min`,
        }
      })

    const remembered = getLastOutlet()
    const fallback = workouts[0]?.outletId ?? os[0]?.id ?? ''
    setOutlets(os)
    setOutletId(os.some((o) => o.id === remembered) ? remembered! : fallback)
    setActive(act)
    setPast(rows)
  }

  // A gym Shafi just named: it becomes the selected, nearby outlet at once.
  function gymAdded(o: Outlet) {
    setAddingGym(false)
    touched.current = true
    setOutlets((prev) => [...prev, o])
    setNearId(o.id)
    setOutletId(o.id)
    setLastOutlet(o.id)
  }

  function chooseOutlet(id: string) {
    touched.current = true
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


  return (
    <div className="screen">
      <div className="lbl home-date">{shortDate(sgIso())}</div>

      <div className="lbl">
        Outlet
        {nearId && (
          <span className="near-note">
            {' '}
            · you are at {shortOutlet(outlets.find((o) => o.id === nearId)?.name ?? '')}
          </span>
        )}
      </div>
      <div className="outlet-grid" role="radiogroup" aria-label="Outlet">
        {outlets.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={o.id === outletId}
            className={`chip ${o.id === outletId ? 'selected' : ''} ${o.id === nearId ? 'near' : ''}`}
            disabled={!!active && o.id !== outletId}
            onClick={() => chooseOutlet(o.id)}
          >
            {o.id === nearId && <i className="near-dot" aria-hidden="true" />}
            {shortOutlet(o.name)}
          </button>
        ))}
        {here && !nearId && !active && (
          <button type="button" className="chip add-gym" onClick={() => setAddingGym(true)}>
            + Add this gym
          </button>
        )}
      </div>

      <button type="button" className="btn primary huge" onClick={start} style={{ marginTop: 16 }}>
        {active ? 'Resume workout' : 'Start workout'}
      </button>

      <div className="two-up">
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
        past.map((p) => (
          <div className="card past" key={p.workout.id}>
            <div>
              <div className="title">{p.title}</div>
              <div className="sub">{p.sub}</div>
            </div>
            <div className="dur">{p.dur}</div>
          </div>
        ))
      )}

      <button
        type="button"
        className="btn secondary wide"
        onClick={() => setExporting(true)}
        style={{ marginTop: 24 }}
      >
        Export JSON
      </button>

      <ExportSheet open={exporting} onClose={() => setExporting(false)} />
      {here && (
        <AddOutletSheet
          open={addingGym}
          here={here}
          onClose={() => setAddingGym(false)}
          onSaved={gymAdded}
        />
      )}
    </div>
  )
}
