import { useRef, useState } from 'react'
import { fmt } from '../util'

type Props = {
  value: number | undefined
  step: number
  onChange: (v: number | undefined) => void
  unit?: string
  prefix?: string
  min?: number
  start?: number // used when an optional value is empty and + or − is tapped
  optional?: boolean // allows clearing the value by typing nothing
}

const LONG_PRESS_MS = 450

export default function Stepper({
  value,
  step,
  onChange,
  unit,
  prefix = '',
  min = 0,
  start = 0,
  optional = false,
}: Props) {
  const [editing, setEditing] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const longPressed = useRef(false)

  function bump(dir: 1 | -1, mult: number) {
    if (value === undefined) {
      onChange(start)
      return
    }
    const next = Math.round((value + dir * step * mult) * 100) / 100
    onChange(Math.max(min, next))
  }

  function press(dir: 1 | -1) {
    longPressed.current = false
    timer.current = window.setTimeout(() => {
      longPressed.current = true
      navigator.vibrate?.(15)
      bump(dir, 2)
    }, LONG_PRESS_MS)
  }

  function release() {
    window.clearTimeout(timer.current)
  }

  function click(dir: 1 | -1) {
    if (longPressed.current) {
      longPressed.current = false
      return
    }
    bump(dir, 1)
  }

  function commit(text: string) {
    setEditing(false)
    if (text.trim() === '') {
      if (optional) onChange(undefined)
      return
    }
    const n = parseFloat(text)
    if (!Number.isNaN(n)) onChange(Math.max(min, n))
  }

  const stepButton = (dir: 1 | -1) => (
    <button
      type="button"
      className="step-btn"
      onPointerDown={() => press(dir)}
      onPointerUp={release}
      onPointerLeave={release}
      onPointerCancel={release}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => click(dir)}
      aria-label={dir === 1 ? 'Increase' : 'Decrease'}
    >
      {dir === 1 ? '+' : '−'}
    </button>
  )

  return (
    <div className="stepper">
      {stepButton(-1)}
      {editing ? (
        <input
          className="step-input"
          type="number"
          inputMode="decimal"
          step="any"
          autoFocus
          defaultValue={value ?? ''}
          onBlur={(e) => commit(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
        />
      ) : (
        <button type="button" className="step-value" onClick={() => setEditing(true)}>
          <span>{value === undefined ? '—' : prefix + fmt(value)}</span>
          {unit && <small>{unit}</small>}
        </button>
      )}
      {stepButton(1)}
    </div>
  )
}
