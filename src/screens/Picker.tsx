import { useEffect, useState } from 'react'
import { db } from '../db'
import type { Exercise, Outlet } from '../types'
import { useLayer } from '../useLayer'
import { popLayer } from '../nav'
import Thumb from '../components/Thumb'
import CustomMachineSheet from './CustomMachineSheet'
import { CHIPS, exercisesFor, type Chip } from '../muscles'

type Props = {
  outlet: Outlet
  onPick: (exerciseId: string, equipmentId?: string) => void
  onClose: () => void
}

const CATEGORY_ORDER = ['Machine', 'Cable', 'Free weight', 'Kettlebell', 'Core', 'Plyo']

export default function Picker({ outlet, onPick, onClose }: Props) {
  const [visible, setVisible] = useState<Exercise[]>([])
  const [recent, setRecent] = useState<Exercise[]>([])
  // Custom machines belong to one outlet: exerciseId -> equipmentId at this outlet.
  const [customHere, setCustomHere] = useState<Record<string, string>>({})
  const [query, setQuery] = useState('')
  const [addingCustom, setAddingCustom] = useState(false)
  // Muscle chip filter; null is the grouped "All" view. Resets each time the picker opens.
  const [chip, setChip] = useState<Chip | null>(null)

  // The picker is a history layer: back closes it and stays on the workout.
  useLayer(true, onClose)

  useEffect(() => {
    load()
  }, [outlet.id])

  async function load() {
    const all = await db.exercises.toArray()
    const eqHere = await db.equipment.where('outletId').equals(outlet.id).toArray()
    const custom: Record<string, string> = {}
    for (const eq of eqHere) {
      if (all.find((e) => e.id === eq.exerciseId)?.custom) custom[eq.exerciseId] = eq.id
    }
    const shown = all
      .filter((e) => !e.custom || custom[e.id])
      .sort((a, b) => a.name.localeCompare(b.name))

    const workoutIds = await db.workouts.where('outletId').equals(outlet.id).primaryKeys()
    const done = (await db.sets.where('workoutId').anyOf(workoutIds).toArray())
      .filter((s) => s.completedAt)
      .sort((a, b) => b.completedAt!.localeCompare(a.completedAt!))
    const recentIds: string[] = []
    for (const s of done) {
      if (!recentIds.includes(s.exerciseId)) recentIds.push(s.exerciseId)
      if (recentIds.length === 8) break
    }

    setCustomHere(custom)
    setVisible(shown)
    setRecent(
      recentIds.map((id) => shown.find((e) => e.id === id)).filter((e): e is Exercise => !!e),
    )
  }

  const q = query.trim().toLowerCase()
  const matches = (e: Exercise) => !q || e.name.toLowerCase().includes(q)
  const pick = (e: Exercise) => onPick(e.id, customHere[e.id])

  const categories = [
    ...CATEGORY_ORDER,
    ...new Set(visible.map((e) => e.category).filter((c) => !CATEGORY_ORDER.includes(c))),
  ]
  const gated = visible.filter((e) => e.gated && matches(e))
  const recentShown = recent.filter(matches)
  const byMuscle = chip ? exercisesFor(chip, visible).filter(matches) : []

  return (
    <div className="overlay">
      <div className="overlay-header">
        <input
          className="search"
          type="search"
          placeholder="Search exercises"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="button" className="btn secondary" onClick={popLayer}>
          Close
        </button>
      </div>

      <div className="chip-row scroll muscle-chips" aria-label="Muscle group">
        <button
          type="button"
          aria-pressed={chip === null}
          className={`chip ${chip === null ? 'selected' : ''}`}
          onClick={() => setChip(null)}
        >
          All
        </button>
        {CHIPS.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={chip === c}
            className={`chip ${chip === c ? 'selected' : ''}`}
            onClick={() => setChip(chip === c ? null : c)}
          >
            {c}
          </button>
        ))}
      </div>

      <button type="button" className="btn secondary wide" onClick={() => setAddingCustom(true)}>
        + Add custom machine here
      </button>

      {chip && byMuscle.length === 0 && <p className="muted empty">Nothing here for that search.</p>}
      {chip &&
        byMuscle.map((e) => (
          <div key={e.id}>
            <ExerciseItem ex={e} onClick={() => pick(e)} />
            {e.gated && <div className="ex-note">{e.note}</div>}
          </div>
        ))}

      {!chip && recentShown.length > 0 && (
        <>
          <h3>Recent at this outlet</h3>
          {recentShown.map((e) => (
            <ExerciseItem key={e.id} ex={e} onClick={() => pick(e)} />
          ))}
        </>
      )}

      {!chip &&
        categories.map((cat) => {
        const items = visible.filter((e) => e.category === cat && !e.gated && matches(e))
        if (items.length === 0) return null
        return (
          <div key={cat}>
            <h3>{cat}</h3>
            {items.map((e) => (
              <ExerciseItem key={e.id} ex={e} onClick={() => pick(e)} />
            ))}
          </div>
        )
      })}

      {!chip && gated.length > 0 && (
        <details className="gated">
          <summary>Gated ({gated.length})</summary>
          {gated.map((e) => (
            <div key={e.id}>
              <ExerciseItem ex={e} onClick={() => pick(e)} />
              <div className="ex-note">{e.note}</div>
            </div>
          ))}
        </details>
      )}

      <CustomMachineSheet
        open={addingCustom}
        outlet={outlet}
        onClose={() => setAddingCustom(false)}
        onSaved={(exerciseId, equipmentId, savedOutletId) => {
          setAddingCustom(false)
          if (savedOutletId === outlet.id) onPick(exerciseId, equipmentId)
        }}
      />
    </div>
  )
}

function ExerciseItem({ ex, onClick }: { ex: Exercise; onClick: () => void }) {
  return (
    <button type="button" className="list-item" onClick={onClick}>
      <Thumb ex={ex} size={44} />
      <span className="name">{ex.name}</span>
      <span className="tags">
        {ex.backCaution && <span className="tag">back</span>}
        {ex.kneeCaution && <span className="tag">knee</span>}
      </span>
    </button>
  )
}
