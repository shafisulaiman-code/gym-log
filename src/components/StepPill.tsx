import { useState } from 'react'
import { parseWeight } from '../weights'
import { fmt } from '../util'

type Props = { value: number; onChange: (kg: number) => void }

const CHOICES = [1.25, 2.5, 5, 10]

// "step 2.5" pill on a machine card. Tap to expand the stack-step choices;
// pick one to write it to that machine and collapse.
export default function StepPill({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState(false)

  function choose(kg: number) {
    onChange(kg)
    setOpen(false)
    setCustom(false)
  }

  function commitCustom(text: string) {
    const kg = parseWeight(text)
    if (kg !== null) choose(kg)
    else setCustom(false)
  }

  return (
    <>
      <button
        type="button"
        className="step-pill"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span>step {fmt(value)}</span>
      </button>
      {open && (
        <div className="step-chips" style={{ gridColumn: '1 / -1', width: '100%' }}>
          {CHOICES.map((kg) => (
            <button
              key={kg}
              type="button"
              className={`chip ${kg === value ? 'selected' : ''}`}
              onClick={() => choose(kg)}
            >
              {fmt(kg)}
            </button>
          ))}
          {custom ? (
            <input
              type="number"
              inputMode="decimal"
              autoFocus
              className="step-input"
              aria-label="Custom step in kg"
              placeholder="kg"
              onBlur={(e) => commitCustom(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
              }}
            />
          ) : (
            <button type="button" className="chip more" onClick={() => setCustom(true)}>
              …
            </button>
          )}
        </div>
      )}
    </>
  )
}
