import type { Exercise } from '../types'
import { frameUrls } from '../visuals'

type Props = { ex: Exercise; size: 64 | 44; onClick?: () => void }

// Technique drawing thumbnail (first frame), or a letter tile when the exercise
// has no drawing.
export default function Thumb({ ex, size, onClick }: Props) {
  const url = frameUrls(ex, import.meta.env.BASE_URL)[0]
  const cls = `thumb s${size} ${url ? 'has-visual' : ''}`
  const inner = url ? <img src={url} alt="" loading="lazy" /> : <span>{ex.name.charAt(0)}</span>
  if (onClick) {
    return (
      <button type="button" className={cls} onClick={onClick} aria-label={`How to do ${ex.name}`}>
        {inner}
      </button>
    )
  }
  return <div className={cls}>{inner}</div>
}
