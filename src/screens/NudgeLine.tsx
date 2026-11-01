import { lineFor, takenText, type Suggestion, type TakenTarget } from '../coach'
import type { Exercise, SetRow } from '../types'

type Props = {
  ex: Exercise
  suggestion: Suggestion
  lastRows: SetRow[]
  taken: TakenTarget | null // the nudge the ghost rows already carry; a tap undoes it
  onTap?: () => void
}

// One line under "Last": today's target. Tapping it rewrites the ghost rows; tapping
// the taken line puts them back. Hold and text carry no tap and render a div.
export default function NudgeLine({ ex, suggestion: s, lastRows, taken, onTap }: Props) {
  if (taken) {
    // Read back from the ghost rows, never recomputed: same copy as the offer, except the kicker.
    return (
      <button type="button" className="nudge taken" onClick={onTap} aria-label="Undo: back to last time's sets">
        <span className="kicker">Trying</span>
        <span>{takenText(ex, taken)}</span>
        <span className="arrow" aria-hidden="true">
          ✓
        </span>
      </button>
    )
  }

  const { kicker, text } = lineFor(ex, s, lastRows)

  if (s.state === 'hold') {
    // "Last one was a 10. Repeat 100 × 12, 11, 10": the load and reps in --text.
    const i = text.indexOf('Repeat ')
    const head = i === -1 ? '' : text.slice(0, i + 7)
    const rest = i === -1 ? text : text.slice(i + 7)
    return (
      <div className="nudge hold">
        <span className="kicker">{kicker}</span>
        <span>
          {head}
          <b>{rest}</b>
        </span>
      </div>
    )
  }

  if (s.state === 'text') {
    return (
      <div className="nudge text">
        <span className="kicker">{kicker}</span>
        <span>{text}</span>
      </div>
    )
  }

  const kind = s.state === 'drop' || s.state === 'reset' ? 'warn' : s.state === 'light' ? 'light' : 'offer'
  return (
    <button type="button" className={`nudge ${kind}`} onClick={onTap}>
      <span className="kicker">{kicker}</span>
      <span>{text}</span>
      <span className="arrow" aria-hidden="true">
        ›
      </span>
    </button>
  )
}
