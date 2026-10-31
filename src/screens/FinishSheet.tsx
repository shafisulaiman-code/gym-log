import BottomSheet, { closeSheet } from '../components/BottomSheet'
import { summarize } from '../summary'
import type { Exercise, SetRow } from '../types'

type Props = {
  open: boolean
  onClose: () => void
  rows: SetRow[]
  exercises: Record<string, Exercise>
  startedAt: string
  onFinish: () => void
}

export default function FinishSheet({ open, onClose, rows, exercises, startedAt, onFinish }: Props) {
  if (!open) return null
  const s = summarize(rows, exercises)
  const sec = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000))
  const duration = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`
  const { count, exerciseName } = s.untickedReal

  return (
    <BottomSheet open={open} onClose={onClose} title="Finish workout?">
      <div className="stats">
        <div className="stat">
          <div className="v num">{duration}</div>
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

      {s.lines.length > 0 && (
        <div className="summary-lines">
          {s.lines.map((l) => (
            <div className="li" key={l.name}>
              <b>{l.name}</b>
              <span>{l.text}</span>
            </div>
          ))}
        </div>
      )}

      {s.nothingLogged ? (
        <div className="warn-line">Nothing logged. This workout will be discarded.</div>
      ) : (
        count > 0 && (
          <div className="warn-line">
            {count} unticked set{count === 1 ? '' : 's'}
            {exerciseName ? ` on ${exerciseName}` : ''} will be discarded
          </div>
        )
      )}

      <div className="sheet-actions">
        <button type="button" className="btn secondary" onClick={closeSheet}>
          Keep going
        </button>
        <button type="button" className="btn primary" onClick={onFinish}>
          Finish
        </button>
      </div>
    </BottomSheet>
  )
}
