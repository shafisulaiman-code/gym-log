import { useState } from 'react'
import { kettlebellSizesKg } from '../db'
import { bellSizes, parseWeight } from '../weights'
import { fmt } from '../util'

type Props = {
  value: number | undefined
  extra: number[] // sizes used before on this exercise (odd gyms have 2 kg steps)
  onChange: (kg: number) => void
}

// Scrollable bell-size chips plus a trailing "…" chip for a custom weight.
export default function BellChips({ value, extra, onChange }: Props) {
  const [typing, setTyping] = useState(false)
  // The current value is always a chip, so a just-typed odd size shows as selected.
  const sizes = bellSizes(kettlebellSizesKg, value === undefined ? extra : [...extra, value])

  function commit(text: string) {
    const kg = parseWeight(text)
    setTyping(false)
    if (kg !== null) onChange(kg)
  }

  return (
    <div className="bell-chips" role="radiogroup" aria-label="Bell size">
      {sizes.map((kg) => (
        <button
          key={kg}
          type="button"
          role="radio"
          aria-checked={value === kg}
          className={`chip ${value === kg ? 'selected' : ''}`}
          onClick={() => onChange(kg)}
        >
          {fmt(kg)}
        </button>
      ))}
      {typing ? (
        <input
          type="number"
          inputMode="decimal"
          autoFocus
          aria-label="Custom bell weight in kg"
          placeholder="kg"
          onBlur={(e) => commit(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
        />
      ) : (
        <button type="button" className="chip more" aria-label="Other weight" onClick={() => setTyping(true)}>
          …
        </button>
      )}
    </div>
  )
}
