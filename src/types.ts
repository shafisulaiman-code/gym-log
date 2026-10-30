export type LoadMode = 'total' | 'per_hand' | 'bodyweight_plus' | 'timed'

export type EquipmentType =
  | 'kettlebell'
  | 'machine_plate'
  | 'machine_selectorised'
  | 'cable'
  | 'dumbbell'
  | 'barbell'
  | 'bodyweight'

export interface Outlet {
  id: string
  name: string
}

export interface Exercise {
  id: string
  name: string
  category: string
  primaryMuscles: string[]
  pattern: string
  equipmentType: EquipmentType
  unilateral: boolean
  loadMode: LoadMode
  defaultIncrementKg: number
  repRange: [number, number]
  backCaution: boolean
  kneeCaution: boolean
  gated: boolean
  note: string
  custom?: boolean // true for machines added from the picker
}

export interface Equipment {
  id: string
  exerciseId: string
  outletId: string
  label: string
  stackStartKg?: number
  stackStepKg: number
  maxKg?: number
}

export interface Workout {
  id: string
  startedAt: string
  endedAt?: string
  outletId: string
  type: 'strength' | 'cardio'
  notes?: string
}

export interface SetRow {
  id: string
  workoutId: string
  exerciseId: string
  equipmentId?: string
  setIndex: number
  isWarmup: boolean
  weightKg?: number
  reps?: number
  durationSec?: number
  rir?: number
  painFlag?: 'back' | 'knee'
  completedAt?: string
  seq: number // creation order, used to order cards and rows
}

export type CardioModality = 'treadmill_z2' | 'treadmill_4x4' | 'bike'

export interface Interval {
  workMin: number
  speedKph?: number
  inclinePct?: number
  peakHr?: number
}

export interface CardioSession {
  id: string
  workoutId: string
  modality: CardioModality
  durationMin: number
  inclinePct?: number
  speedKph?: number
  avgHr?: number
  maxHr?: number
  intervals?: Interval[]
  rpe?: number
  notes?: string
}

export interface Bodyweight {
  id: string
  date: string
  kg: number
  waistCm?: number
}

export interface SyncLog {
  id: string
  workoutId: string
  sentAt: string
  status: string
}
