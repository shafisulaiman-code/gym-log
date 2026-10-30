import { useEffect, useState } from 'react'
import { db } from '../db'
import type { Equipment, Exercise, Outlet } from '../types'
import { shortOutlet, uuid } from '../util'

type Props = {
  outlet: Outlet
  onCancel: () => void
  onSaved: (exerciseId: string, equipmentId: string, outletId: string) => void
}

const STEP_CHOICES = [2.5, 5, 7, 10]

export default function CustomMachineSheet({ outlet, onCancel, onSaved }: Props) {
  const [outlets, setOutlets] = useState<Outlet[]>([])
  const [name, setName] = useState('')
  const [outletId, setOutletId] = useState(outlet.id)
  const [step, setStep] = useState<number | 'custom'>(5)
  const [customStep, setCustomStep] = useState('')
  const [startKg, setStartKg] = useState('')

  useEffect(() => {
    db.outlets.toArray().then(setOutlets)
  }, [])

  const stepKg = step === 'custom' ? parseFloat(customStep) : step
  const canSave = name.trim() !== '' && stepKg > 0

  async function save() {
    if (!canSave) return
    const chosen = outlets.find((o) => o.id === outletId) ?? outlet
    const start = parseFloat(startKg)
    const ex: Exercise = {
      id: uuid(),
      name: name.trim(),
      category: 'Machine',
      primaryMuscles: [],
      pattern: 'other',
      equipmentType: 'machine_selectorised',
      unilateral: false,
      loadMode: 'total',
      defaultIncrementKg: stepKg,
      repRange: [8, 12],
      backCaution: false,
      kneeCaution: false,
      gated: false,
      note: '',
      custom: true,
    }
    const eq: Equipment = {
      id: uuid(),
      exerciseId: ex.id,
      outletId: chosen.id,
      label: `${ex.name} @ ${shortOutlet(chosen.name)}`,
      stackStepKg: stepKg,
      stackStartKg: Number.isNaN(start) ? undefined : start,
    }
    await db.exercises.add(ex)
    await db.equipment.add(eq)
    onSaved(ex.id, eq.id, chosen.id)
  }

  return (
    <div className="overlay">
      <h2>Custom machine</h2>

      <label className="field">
        <span>Name</span>
        <input
          type="text"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Hack Squat"
        />
      </label>

      <label className="field">
        <span>Outlet</span>
        <select value={outletId} onChange={(e) => setOutletId(e.target.value)}>
          {outlets.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>

      <div className="field">
        <span>Stack step (kg)</span>
        <div className="chip-row">
          {STEP_CHOICES.map((s) => (
            <button
              key={s}
              type="button"
              className={`chip ${step === s ? 'selected' : ''}`}
              onClick={() => setStep(s)}
            >
              {s}
            </button>
          ))}
          <button
            type="button"
            className={`chip ${step === 'custom' ? 'selected' : ''}`}
            onClick={() => setStep('custom')}
          >
            custom
          </button>
        </div>
        {step === 'custom' && (
          <input
            type="number"
            inputMode="decimal"
            autoFocus
            value={customStep}
            onChange={(e) => setCustomStep(e.target.value)}
            placeholder="Step kg"
          />
        )}
      </div>

      <label className="field">
        <span>Start weight (optional)</span>
        <input
          type="number"
          inputMode="decimal"
          value={startKg}
          onChange={(e) => setStartKg(e.target.value)}
          placeholder="kg"
        />
      </label>

      <div className="card-actions">
        <button type="button" className="btn secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn primary" disabled={!canSave} onClick={save}>
          Save & add
        </button>
      </div>
    </div>
  )
}
