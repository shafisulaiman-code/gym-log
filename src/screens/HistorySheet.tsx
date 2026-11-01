import BottomSheet from '../components/BottomSheet'
import Sparkline from '../components/Sparkline'
import { history, sessionsFor } from '../coach'
import type { GymData } from '../export'
import { formatSession, ratingOf } from '../history'
import { axisText, hasEstimate, historyStats } from '../historyView'
import type { Exercise } from '../types'
import { shortOutlet } from '../util'
import { dateOf, dayLabel } from '../week'

type Props = { data: GymData | null; ex: Exercise | null; keyId: string | null; onClose: () => void }

// One lift's last twelve sessions: three numbers, the e1RM line, then the sessions
// newest first. Opens from the "Last" line on a workout card.
export default function HistorySheet({ data, ex, keyId, onClose }: Props) {
  if (!data || !ex || !keyId) return null
  const { points, best, stall } = history(data, ex, keyId)
  const total = sessionsFor(data, keyId).length
  const est = hasEstimate(points)
  const stats = historyStats(ex, points, best, total)
  const axis = axisText(points)
  const outlet = (() => {
    if (!keyId.startsWith('eq:')) return null
    const eq = data.equipment.find((e) => e.id === keyId.slice(3))
    return eq ? (data.outlets.find((o) => o.id === eq.outletId) ?? null) : null
  })()
  const newest = [...points].reverse()

  return (
    <BottomSheet open onClose={onClose}>
      {outlet && <div className="hist-kicker">{shortOutlet(outlet.name)} machine</div>}
      <h2 className="hist-title">{ex.name}</h2>
      {points.length === 0 ? (
        <p className="hist-note">No sessions yet.</p>
      ) : (
        <>
          <div className="hist-stats">
            {stats.map((s) => (
              <div key={s.caption} className={s.accent ? 'pr' : undefined}>
                <b>{s.value}</b>
                <span>{s.caption}</span>
              </div>
            ))}
          </div>
          {est && (
            <>
              <Sparkline
                points={points
                  .filter((p) => p.e1rm)
                  .map((p) => ({ kg: p.e1rm!.kg, rough: p.e1rm!.rough, best: p === best }))}
              />
              <div className="hist-axis">
                {axis.map((a, i) => (
                  <span key={i}>{a}</span>
                ))}
              </div>
            </>
          )}
          <div className="hist-list">
            {newest.map((p, i) => {
              const { rpe, pain } = ratingOf(p.session.rows)
              return (
                <div className="hist-row" key={p.session.workout.id}>
                  <span className="d">{dayLabel(dateOf(p.session.workout.startedAt))}</span>
                  <span className="s">
                    {formatSession(ex, p.session.rows) || 'warm-up only'}
                    {rpe !== undefined && <span className="rpe">{` · RPE ${rpe}`}</span>}
                    {pain && <span className="pain">{` · ${pain}`}</span>}
                    {p.session.light && <span className="tag light">light</span>}
                  </span>
                  {est && p.e1rm && (
                    <span className={`e${p.e1rm.rough ? ' rough' : ''}${p.pr ? ' pr' : ''}`}>{Math.round(p.e1rm.kg)}</span>
                  )}
                  {p.pr && <span className="tag pr">PR</span>}
                  {i === 0 && stall && <span className="tag stall">{`stall ${stall.sessions}`}</span>}
                </div>
              )
            })}
          </div>
          <div className="hist-note">
            {est
              ? 'Estimate is Epley from the best working set. Faint means over ten reps, so rough. Warm-ups never count.'
              : 'Warm-ups never count.'}
          </div>
        </>
      )}
    </BottomSheet>
  )
}
