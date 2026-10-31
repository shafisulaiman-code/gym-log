import { useState } from 'react'
import { db } from '../db'
import type { Outlet } from '../types'
import { makeOutlet, type LatLng } from '../geo'
import BottomSheet from '../components/BottomSheet'

type Props = {
  open: boolean
  here: LatLng | null
  onClose: () => void
  onSaved: (outlet: Outlet) => void
}

// Shown from Home when no known outlet is nearby: name this gym and it is
// saved, with the phone's position when there is one so next visit it is
// recognised.
export default function AddOutletSheet({ open, here, onClose, onSaved }: Props) {
  const [name, setName] = useState('')
  const outlet = makeOutlet(name, here)

  async function save() {
    if (!outlet) return
    await db.outlets.add(outlet)
    setName('')
    onSaved(outlet)
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Add a gym">
      <p className="muted" style={{ marginTop: 0 }}>
        {here
          ? 'Saved with your current location, so it is picked for you next time you are here. '
          : 'Saved by name. '}
        Machines you log get their own weights at this gym.
      </p>
      <label className="field">
        <span>Name</span>
        <input
          type="text"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
          }}
          placeholder="e.g. AF Bedok, Hotel gym KL"
        />
      </label>
      <button type="button" className="btn primary wide" disabled={!outlet} onClick={save}>
        Save gym
      </button>
    </BottomSheet>
  )
}
