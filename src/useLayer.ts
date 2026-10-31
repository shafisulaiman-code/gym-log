import { useEffect, useRef } from 'react'
import { pushLayer, releaseLayer } from './nav'

// Ties a layer (sheet, picker) to a history entry while `open` is true.
// Back runs onClose. Closing programmatically (open → false, or unmount)
// releases the entry so back-press counting stays right.
export function useLayer(open: boolean, onClose: () => void): void {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const id = useRef<number | null>(null)

  useEffect(() => {
    if (!open) return
    const myId = pushLayer(() => {
      id.current = null
      closeRef.current()
    })
    id.current = myId
    return () => {
      if (id.current === myId) {
        id.current = null
        releaseLayer(myId)
      }
    }
  }, [open])
}
