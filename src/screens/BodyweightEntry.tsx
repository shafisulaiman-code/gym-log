import { useEffect, useState } from 'react'
import { db } from '../db'
import type { Bodyweight } from '../types'
import { fmt, sgDate, uuid } from '../util'
import Stepper from '../components/Stepper'

type Props = { onDone: () => void }

export default function BodyweightEntry({ onDone }: Props) {
  const [recent, setRecent] = useState<Bodyweight[]>([])
  const [date, setDate] = useState(sgDate())
  const [kg, setKg] = useState<number | undefined>(undefined)
  const [waist, setWaist] = useState<number | undefined>(undefined)

  useEffect(() => {
    db.bodyweight
      .orderBy('date')
      .reverse()
      .limit(10)
      .toArray()
      .then((rows) => {
        setRecent(rows)
        setKg(rows[0]?.kg ?? 100)
      })
  }, [])

  async function save() {
    if (kg === undefined) return
    await db.bodyweight.add({ id: uuid(), date, kg, waistCm: waist })
    onDone()
  }

  return (
    <div className="screen">
      <header className="simple-header">
        <button type="button" className="back" onClick={onDone} aria-label="Back">
          ‹
        </button>
        <h1>Bodyweight</h1>
      </header>

      <label className="field">
        <span>Date</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>

      <div className="card">
        <div className="form-row">
          <span>Weight</span>
          <Stepper value={kg} step={0.1} unit="kg" onChange={setKg} />
        </div>
        <div className="form-row">
          <span>Waist (optional)</span>
          <Stepper
            value={waist}
            step={0.5}
            unit="cm"
            optional
            start={recent.find((r) => r.waistCm)?.waistCm ?? 100}
            onChange={setWaist}
          />
        </div>
      </div>

      <button type="button" className="btn primary big" onClick={save}>
        Save
      </button>

      {recent.length > 0 && (
        <>
          <h3>Recent</h3>
          <ul className="history">
            {recent.map((r) => (
              <li key={r.id}>
                <span>{r.date}</span>
                <span>
                  {fmt(r.kg)} kg{r.waistCm ? ` · ${fmt(r.waistCm)} cm` : ''}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
