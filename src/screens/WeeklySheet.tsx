import { useCallback, useEffect, useState } from 'react'
import FileSheet from '../components/FileSheet'
import { buildWeeklyFile } from '../export'
import { previousWeek, weekOf } from '../week'
import { sgDate } from '../util'

type Props = { open: boolean; onClose: () => void }

export default function WeeklySheet({ open, onClose }: Props) {
  const [which, setWhich] = useState<'this' | 'last'>('this')

  // "This week" is the default every time the sheet opens.
  useEffect(() => {
    if (open) setWhich('this')
  }, [open])

  const current = weekOf(sgDate())
  const week = which === 'this' ? current : previousWeek(current)
  const build = useCallback(() => buildWeeklyFile(week), [week.start])

  return (
    <FileSheet open={open} onClose={onClose} title="Weekly summary" copyLabel="Copy" build={build}>
      <div className="seg two" role="radiogroup" aria-label="Week" style={{ marginBottom: 14 }}>
        <button type="button" role="radio" aria-checked={which === 'this'} className={which === 'this' ? 'on' : ''} onClick={() => setWhich('this')}>
          This week
        </button>
        <button type="button" role="radio" aria-checked={which === 'last'} className={which === 'last' ? 'on' : ''} onClick={() => setWhich('last')}>
          Last week
        </button>
      </div>
    </FileSheet>
  )
}
