import type { CoachRow } from '../coach'
import { capRows, rowCopy } from '../coachView'

type Props = { rows: CoachRow[]; onRow: (row: CoachRow) => void }

const ICON = { pr: 'PR', stall: '!', light: '↓' } as const

function iconOf(row: CoachRow): keyof typeof ICON {
  return row.kind === 'pr' ? 'pr' : row.kind === 'stall' ? 'stall' : 'light'
}

// The coach card on Home: the light week row, stalls, then this week's PRs.
export default function CoachCard({ rows, onRow }: Props) {
  if (rows.length === 0) return null
  const { shown, more } = capRows(rows)

  return (
    <section className="card coach" aria-label="Coach">
      <div className="coach-head">
        <span className="coach-kicker">Coach</span>
        <small>this week</small>
      </div>
      {shown.map((row, i) => {
        const { title, detail } = rowCopy(row)
        const ic = iconOf(row)
        return (
          <button
            type="button"
            className="coach-row"
            key={row.kind === 'pr' || row.kind === 'stall' ? `${row.kind}:${row.key}` : row.kind}
            onClick={() => onRow(row)}
          >
            <i className={`coach-ic ${ic}`} aria-hidden="true">
              {ICON[ic]}
            </i>
            <div className="coach-text">
              <b>{title}</b>
              <span>{detail}</span>
            </div>
            <i className="coach-chev" aria-hidden="true">
              ›
            </i>
          </button>
        )
      })}
      {more > 0 && <div className="coach-more">and {more} more</div>}
    </section>
  )
}
