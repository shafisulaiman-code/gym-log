import { useEffect, useState } from 'react'
import { db } from '../db'
import BottomSheet, { closeSheet } from '../components/BottomSheet'
import Thumb from '../components/Thumb'
import { summarize, type Summary } from '../summary'
import { cardioLines } from '../sessionDetail'
import type { CardioSession, Exercise, Workout } from '../types'
import { minutesBetween } from '../util'
import { shortDate } from './Home'

type Props = {
  workout: Workout | null
  outletName: string
  onClose: () => void
  onDeleted: () => void
}

type Detail = {
  summary: Summary | null
  exercises: Record<string, Exercise>
  cardio: CardioSession | null
}

// A past session in full: stats, every exercise with its sets, the note, and
// a two-tap delete for sessions that should not have been saved.
export default function SessionSheet({ workout, outletName, onClose, onDeleted }: Props) {
  const [detail, setDetail] = useState<Detail | null>(null)
  const [confirm, setConfirm] = useState(false)

  useEffect(() => {
    setDetail(null)
    setConfirm(false)
    if (!workout) return
    let live = true
    ;(async () => {
      const [rows, exList, cardio] = await Promise.all([
        db.sets.where('workoutId').equals(workout.id).toArray(),
        db.exercises.toArray(),
        db.cardio_sessions.where('workoutId').equals(workout.id).first(),
      ])
      const exercises = Object.fromEntries(exList.map((e) => [e.id, e]))
      if (live) {
        setDetail({
          summary: workout.type === 'strength' ? summarize(rows, exercises) : null,
          exercises,
          cardio: cardio ?? null,
        })
      }
    })()
    return () => {
      live = false
    }
  }, [workout?.id])

  async function remove() {
    if (!workout) return
    if (!confirm) {
      setConfirm(true)
      return
    }
    const setIds = await db.sets.where('workoutId').equals(workout.id).primaryKeys()
    const cardioIds = await db.cardio_sessions.where('workoutId').equals(workout.id).primaryKeys()
    await db.sets.bulkDelete(setIds)
    await db.cardio_sessions.bulkDelete(cardioIds)
    await db.workouts.delete(workout.id)
    onDeleted()
  }

  if (!workout) return null
  const mins = workout.endedAt ? minutesBetween(workout.startedAt, workout.endedAt) : 0
  const title = `${shortDate(workout.startedAt)} · ${workout.type === 'cardio' ? 'Cardio' : outletName}`
  const s = detail?.summary

  return (
    <BottomSheet open onClose={onClose} title={title} height="tall">
      {!detail ? (
        <p className="muted">Loading…</p>
      ) : s ? (
        <>
          <div className="stats">
            <div className="stat">
              <div className="v num">{mins}<small> min</small></div>
              <div className="l">Duration</div>
            </div>
            <div className="stat">
              <div className="v num">{s.done}</div>
              <div className="l">Sets</div>
            </div>
            <div className="stat">
              <div className="v num">
                {s.volumeKg.toLocaleString('en-SG')}
                <small> kg</small>
              </div>
              <div className="l">Volume</div>
            </div>
          </div>
          {s.lines.length === 0 ? (
            <p className="muted">No sets were ticked in this session.</p>
          ) : (
            <div className="session-lines">
              {s.lines.map((l) => {
                const ex = Object.values(detail.exercises).find((e) => e.name === l.name)
                return (
                  <div className="li" key={l.name}>
                    {ex && <Thumb ex={ex} size={44} />}
                    <div className="body">
                      <b>{l.name}</b>
                      <span>{l.text}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      ) : detail.cardio ? (
        <div className="summary-lines">
          {cardioLines(detail.cardio).map((l) => (
            <div className="li" key={l.label}>
              <b>{l.label}</b>
              <span>{l.value}</span>
            </div>
          ))}
          {detail.cardio.notes && <p className="muted">{detail.cardio.notes}</p>}
        </div>
      ) : (
        <p className="muted">No details were saved for this session.</p>
      )}

      {workout.notes && <p className="session-note">{workout.notes}</p>}

      <div className="sheet-actions">
        <button type="button" className="btn secondary" onClick={closeSheet}>
          Done
        </button>
        <button type="button" className={`btn ${confirm ? 'danger' : 'quiet'}`} onClick={remove}>
          {confirm ? 'Tap again to delete' : 'Delete workout'}
        </button>
      </div>
    </BottomSheet>
  )
}
