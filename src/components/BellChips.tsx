import { kettlebellSizesKg } from '../db'

type Props = { value: number | undefined; onChange: (kg: number) => void }

export default function BellChips({ value, onChange }: Props) {
  return (
    <div className="bell-chips">
      {kettlebellSizesKg.map((kg) => (
        <button
          key={kg}
          type="button"
          className={`chip ${value === kg ? 'selected' : ''}`}
          onClick={() => onChange(kg)}
        >
          {kg}
        </button>
      ))}
    </div>
  )
}
