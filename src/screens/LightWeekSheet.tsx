import BottomSheet, { closeSheet } from '../components/BottomSheet'
import { daysLeftText } from '../coachView'

type Props = {
  mode: 'due' | 'running' | null
  daysLeft?: number
  onStart: () => void
  onNotNow: () => void
  onEnd: () => void
  onKeep: () => void
  onClose: () => void
}

// Confirm sheet for the light week: start or snooze when due, keep or end when running.
export default function LightWeekSheet({ mode, daysLeft = 0, onStart, onNotNow, onEnd, onKeep, onClose }: Props) {
  // Buttons close the sheet the way back does, then run their handler.
  const then = (fn: () => void) => () => {
    closeSheet()
    fn()
  }

  return (
    <BottomSheet
      open={mode !== null}
      onClose={onClose}
      title={mode === 'running' ? `Light week · ${daysLeftText(daysLeft)}` : 'Start a light week?'}
    >
      {mode === 'running' ? (
        <>
          <p className="muted light-body">Targets stay light until it ends.</p>
          <div className="sheet-actions">
            <button type="button" className="btn secondary" onClick={then(onKeep)}>
              Keep going
            </button>
            <button type="button" className="btn danger" onClick={then(onEnd)}>
              End light week early
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="muted light-body">
            For the next seven days every lift&apos;s target drops ten percent (bells keep their size and lose a set).
            PRs and stalls are not judged during it.
          </p>
          <div className="sheet-actions">
            <button type="button" className="btn secondary" onClick={then(onNotNow)}>
              Not now
            </button>
            <button type="button" className="btn primary" onClick={then(onStart)}>
              Start light week
            </button>
          </div>
        </>
      )}
    </BottomSheet>
  )
}
