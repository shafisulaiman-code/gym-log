import BottomSheet, { closeSheet } from '../components/BottomSheet'
import { frameUrls } from '../visuals'
import type { Exercise } from '../types'

type Props = { ex: Exercise | null; onClose: () => void }

function loadPill(ex: Exercise): string | null {
  switch (ex.loadMode) {
    case 'per_hand':
      return 'per hand'
    case 'bodyweight_plus':
      return '+ kg'
    case 'timed':
      return 'seconds'
    case 'height_cm':
      return 'cm'
    default:
      return null
  }
}

// How to do this exercise: muscles and cautions, start/end drawings that
// crossfade when both exist, the cue list, and a YouTube fallback that needs a connection.
export default function TechniqueSheet({ ex, onClose }: Props) {
  if (!ex) return null
  const frames = frameUrls(ex, import.meta.env.BASE_URL)
  const [lo, hi] = ex.repRange
  const range = ex.loadMode === 'timed' ? `${lo}–${hi} s` : `${lo}–${hi} reps`
  const load = loadPill(ex)
  let n = 0

  function watch() {
    const q = encodeURIComponent(`${ex!.name} form`)
    window.open(`https://www.youtube.com/results?search_query=${q}`, '_blank', 'noopener')
  }

  return (
    <BottomSheet open onClose={onClose} title={ex.name} height="tall">
      <div className="pill-row" style={{ marginBottom: 12 }}>
        {ex.primaryMuscles.length > 0 && <span className="pill">{ex.primaryMuscles.join(' · ')}</span>}
        <span className="pill">{range}</span>
        {load && <span className="pill">{load}</span>}
        {ex.backCaution && <span className="pill caution">Back</span>}
        {ex.kneeCaution && <span className="pill caution">Knee</span>}
      </div>

      <div className={`media ${frames.length === 2 ? 'two' : ''}`}>
        {frames.length > 0 ? (
          frames.map((src, i) => <img key={src} src={src} alt={`${ex.name}, ${i === 0 ? 'start' : 'end'} position`} />)
        ) : (
          <div className="placeholder">No drawing yet</div>
        )}
      </div>
      {frames.length > 0 && (
        <p className="credit">
          Drawing by Everkinetic,{' '}
          <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noopener">
            CC BY-SA 3.0
          </a>
        </p>
      )}

      {ex.cues.length > 0 ? (
        <ul className="cues">
          {ex.cues.map((cue) => {
            const caution = cue.startsWith('!')
            const text = caution ? cue.slice(1) : cue
            if (!caution) n += 1
            return (
              <li key={cue} className={caution ? 'caution' : ''}>
                <i>{caution ? '!' : n}</i>
                <span>{text}</span>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="muted">No cues yet for this machine.</p>
      )}

      <button type="button" className="btn quiet wide" onClick={watch} style={{ marginTop: 14 }}>
        Watch on YouTube
      </button>
      <button type="button" className="btn secondary wide" onClick={closeSheet} style={{ marginTop: 4 }}>
        Done
      </button>
    </BottomSheet>
  )
}
