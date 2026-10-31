import type { ReactNode } from 'react'
import { popLayer } from '../nav'
import { useLayer } from '../useLayer'

type Props = {
  open: boolean
  onClose: () => void
  title?: string
  height?: 'auto' | 'tall'
  children: ReactNode
}

// Slide-up sheet over a scrim. Holds a history layer while open so the Android
// back button closes it; buttons that close it call closeSheet() for the same path.
export default function BottomSheet({ open, onClose, title, height = 'auto', children }: Props) {
  useLayer(open, onClose)
  if (!open) return null

  return (
    <div className="sheet-scrim" onClick={closeSheet}>
      <div
        className={`sheet ${height === 'tall' ? 'tall' : ''}`}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-grab" />
        {title && <h3 className="sheet-title">{title}</h3>}
        {children}
      </div>
    </div>
  )
}

// For buttons inside a sheet that should close it the same way back does.
export function closeSheet() {
  popLayer()
}
