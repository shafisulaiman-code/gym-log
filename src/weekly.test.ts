import { describe, expect, it } from 'vitest'
import { weeklyFileName, weeklySummary } from './weekly'
import { weekOf } from './week'
import type { GymData } from './export'
import type { Exercise, SetRow, Workout } from './types'
import { legPress, eq } from './history.test'

const dbBench: Exercise = { ...legPress, id: 'db-bench', name: 'Dumbbell Bench Press', category: 'Free weight', primaryMuscles: [], equipmentType: 'dumbbell', loadMode: 'per_hand' }
const W44 = weekOf('2026-10-31')
const GEN = '2026-11-01T21:10:00+08:00'
const outlets = [{ id: 'o1', name: 'AF Tampines West' }, { id: 'o2', name: 'AF Orchard Gateway' }]
const eq2 = { ...eq, id: 'eq2', outletId: 'o2', label: 'Leg Press @ Orchard Gateway' }

// Every workout starts at 18:00 on its date; each set is ticked a minute later than the one before.
let n = 0
const dates: Record<string, string> = {}
const workout = (id: string, date: string, outletId = 'o1', patch: Partial<Workout> = {}): Workout => {
  dates[id] = date
  return { id, startedAt: `${date}T18:00:00+08:00`, endedAt: `${date}T18:52:00+08:00`, outletId, type: 'strength', ...patch }
}
const set = (workoutId: string, exerciseId: string, patch: Partial<SetRow>): SetRow => {
  n += 1
  const completedAt = `${dates[workoutId]}T18:${String(10 + n).padStart(2, '0')}:00+08:00`
  return { id: `s${n}`, workoutId, exerciseId, setIndex: 0, isWarmup: false, seq: n, completedAt, ...patch }
}
const lp = (workoutId: string, weightKg: number, reps: number, extra: Partial<SetRow> = {}) =>
  set(workoutId, legPress.id, { equipmentId: 'eq1', weightKg, reps, ...extra })

function fixture(): GymData {
  n = 0
  const workouts = [
    workout('w3', '2026-10-03'), workout('w10', '2026-10-10'), workout('w17', '2026-10-17'), workout('w24', '2026-10-24'),
    workout('w31', '2026-10-31', 'o1', { notes: 'Swing felt it in the lower back on set 3' }),
    workout('w26', '2026-10-26'),
    workout('c29', '2026-10-29', 'o1', { type: 'cardio', endedAt: `2026-10-29T18:38:00+08:00` }),
    workout('og', '2026-10-28', 'o2'),
    workout('open', '2026-10-30', 'o1', { endedAt: undefined }),
    // Dumbbell bench history: two plain sessions, then a light one that must never count against the PR.
    workout('d12', '2026-10-12'), workout('d17', '2026-10-17'), workout('d19', '2026-10-19'),
    // Orchard Gateway: 14 Oct is before the light week and 21 Oct inside it, so only 27 Oct, 28 Oct and 1 Nov are fresh.
    workout('og14', '2026-10-14', 'o2'), workout('og21', '2026-10-21', 'o2'), workout('og27', '2026-10-27', 'o2'), workout('og1', '2026-11-01', 'o2'),
  ]
  const og = (workoutId: string) => [1, 2, 3].map(() => set(workoutId, legPress.id, { equipmentId: 'eq2', weightKg: 80, reps: 12 }))
  const sets = [
    ...['w3', 'w10', 'w17', 'w24'].flatMap((id) => [
      lp(id, 100, 12), lp(id, 100, 12), lp(id, 100, 10, id === 'w10' ? { rpe: 7 } : id === 'w24' ? { rpe: 8 } : {}),
    ]),
    lp('w31', 60, 12, { isWarmup: true }), lp('w31', 95, 12, { coach: 'reset' }), lp('w31', 95, 12, { coach: 'reset' }), lp('w31', 95, 10, { rpe: 8, painFlag: 'back', coach: 'reset' }),
    set('d12', dbBench.id, { weightKg: 24, reps: 10 }), set('d17', dbBench.id, { weightKg: 25, reps: 10 }), set('d19', dbBench.id, { weightKg: 28, reps: 10 }),
    set('w26', dbBench.id, { weightKg: 26, reps: 10 }), set('w26', dbBench.id, { weightKg: 26, reps: 9 }),
    ...og('og14'), ...og('og21'), ...og('og27'), ...og('og'), ...og('og1'),
    set('open', legPress.id, { equipmentId: 'eq1', weightKg: 100, reps: 12 }),
    set('w26', 'gone-exercise', { weightKg: 1, reps: 1 }),
  ]
  return {
    outlets, exercises: [legPress, dbBench], equipment: [eq, eq2], workouts, sets,
    cardio: [{ id: 'c1', workoutId: 'c29', modality: 'treadmill_4x4', durationMin: 38, speedKph: 6.2, inclinePct: 10, avgHr: 148, maxHr: 171, rpe: 8,
      intervals: [{ workMin: 4, speedKph: 6.2, inclinePct: 10, peakHr: 165 }, { workMin: 4, speedKph: 6.2, inclinePct: 10, peakHr: 168 }, { workMin: 4, speedKph: 6.5, inclinePct: 10, peakHr: 170 }, { workMin: 4, speedKph: 6.2, inclinePct: 10, peakHr: 171 }] }],
    bodyweight: [{ id: 'b1', date: '2026-09-29', kg: 110.6 }, { id: 'b2', date: '2026-10-27', kg: 109.4, waistCm: 108 }],
    coach: { lightWeeks: [{ startedAt: '2026-10-19T09:00:00+08:00', endsAt: '2026-10-26T09:00:00+08:00' }] },
  }
}

describe('weeklySummary', () => {
  const md = weeklySummary(fixture(), W44, GEN)
  const lines = md.split('\n')

  it('writes the header', () => {
    expect(lines[0]).toBe('# Gym Log · week 44 · Mon 26 Oct to Sun 1 Nov 2026')
    expect(lines[1]).toBe('Generated Sun 1 Nov 2026 21:10 (+08:00). Weights in kg. "ph" = per hand. Effort is RPE out of 10. e1RM is Epley from the best working set; "~" means over ten reps.')
  })
  it('lists finished sessions in date order and skips the unfinished one', () => {
    expect(md).toContain('| Mon 26 Oct | Tampines West | Strength | 52 min | 2 | 988 kg |')
    expect(md).toContain('| Wed 28 Oct | Orchard Gateway | Strength | 52 min | 3 | 2,880 kg |')
    expect(md).toContain('| Thu 29 Oct | Tampines West | Cardio | 38 min | 4x4 | avg 148 · max 171 |')
    expect(md).toContain('| Sat 31 Oct | Tampines West | Strength | 52 min | 4 | 3,230 kg |')
    expect(md).not.toContain('Fri 30 Oct')
    expect(md.indexOf('Mon 26 Oct |')).toBeLessThan(md.indexOf('Sat 31 Oct |'))
  })
  it('keys machines per outlet and gives three prior sessions', () => {
    const i = md.indexOf('### Leg Press (Tampines West machine)')
    const block = md.slice(i, md.indexOf('###', i + 1))
    expect(block).toContain('- **Sat 31 Oct · 95 × 12, 12, 10 · RPE 8 · back · e1RM ~133**')
    expect(block).toContain('- Sat 24 Oct · 100 × 12, 12, 10 · RPE 8 · e1RM ~140')
    expect(block).toContain('- Sat 17 Oct · 100 × 12, 12, 10 · e1RM ~140')
    expect(block).toContain('- Sat 10 Oct · 100 × 12, 12, 10 · RPE 7 · e1RM ~140')
    expect(block).not.toContain('3 Oct')
    expect(block).not.toContain('Fri 30 Oct')
    expect(md).toContain('### Leg Press (Orchard Gateway machine)\n- **Sun 1 Nov · 80 × 12, 12, 12 · e1RM ~112**\n- **Wed 28 Oct · 80 × 12, 12, 12 · e1RM ~112**\n- **Tue 27 Oct · 80 × 12, 12, 12 · e1RM ~112**\n- Wed 21 Oct · 80 × 12, 12, 12 · e1RM ~112')
    expect(md).toContain('### Dumbbell Bench Press\n- **Mon 26 Oct · 26 ph × 10, 9 · e1RM 35**')
  })
  it('orders exercises by first appearance in the week', () => {
    expect(md.indexOf('### Dumbbell Bench Press')).toBeLessThan(md.indexOf('### Leg Press (Orchard'))
  })
  it('ignores rows whose exercise is gone', () => {
    expect(md).not.toContain('gone-exercise')
  })
  it('counts working sets per muscle with zeros', () => {
    expect(md).toContain('## Working sets per muscle this week\nLegs 12 (hard 3) · Chest 0 (hard 0) · Back 0 (hard 0) · Shoulders 0 (hard 0) · Biceps 0 (hard 0) · Triceps 0 (hard 0) · Glutes 0 (hard 0) · Core 0 (hard 0)')
  })
  it('writes cardio with peaks and an interval override', () => {
    expect(md).toContain('- Thu 29 Oct · Treadmill 4x4 intervals · 38 min · 6.2 km/h at 10% (int 3: 6.5 km/h) · peaks 165, 168, 170, 171 · avg 148 · max 171 · RPE 8')
  })
  it('writes bodyweight with the four-week change', () => {
    expect(md).toContain('- Tue 27 Oct · 109.4 kg · waist 108 cm\n- Four weeks ago (Tue 29 Sep): 110.6 kg. Change: −1.2 kg')
  })
  it('quotes notes with their date', () => {
    expect(md).toContain('## Notes\n- Sat 31 Oct: "Swing felt it in the lower back on set 3"')
  })
  it('adds the estimate to each strength bullet, rough marked', () => {
    expect(md).toContain('- **Sat 31 Oct · 95 × 12, 12, 10 · RPE 8 · back · e1RM ~133**')
    expect(md).toContain('- Sat 24 Oct · 100 × 12, 12, 10 · RPE 8 · e1RM ~140')
  })
  it('marks a solid estimate without the tilde and gives no segment without one', () => {
    const f = fixture()
    const bw: Exercise = { ...dbBench, id: 'chin', name: 'Chin Up', loadMode: 'bodyweight_plus' }
    f.exercises = [...f.exercises, bw]
    f.sets = [...f.sets, set('w26', 'chin', { weightKg: 10, reps: 8 })]
    const out = weeklySummary(f, W44, GEN)
    expect(out).toContain('### Chin Up\n- **Mon 26 Oct · BW+10 × 8**\n')
    const f2 = fixture()
    f2.sets = f2.sets.map((s) => (s.workoutId === 'w26' && s.exerciseId === dbBench.id ? { ...s, reps: 8 } : s))
    expect(weeklySummary(f2, W44, GEN)).toContain('- **Mon 26 Oct · 26 ph × 8, 8 · e1RM 33**')
  })
  it('writes the Coach section after Sessions', () => {
    const i = md.indexOf('## Coach')
    expect(i).toBeGreaterThan(md.indexOf('## Sessions'))
    expect(i).toBeLessThan(md.indexOf('## Strength, by exercise'))
    const block = md.slice(i, md.indexOf('## Strength'))
    expect(block).toContain('- PR: Dumbbell Bench Press · e1RM 35, up from 33 · Mon 26 Oct')
    expect(block).toContain('- Stalled: Leg Press (Orchard Gateway machine) · 3 sessions at 80 × 12')
    expect(block).toContain('- Reset taken: Leg Press (Tampines West machine) · to 95 · Sat 31 Oct')
    expect(block).toContain('- Light week: Mon 19 Oct to Mon 26 Oct')
    expect(block).not.toContain('(running)')
  })
  it('orders the Coach bullets PR, stalled, reset, light week', () => {
    const block = md.slice(md.indexOf('## Coach'), md.indexOf('## Strength'))
    const order = ['- PR:', '- Stalled:', '- Reset taken:', '- Light week:'].map((h) => block.indexOf(h))
    expect(order.every((x) => x >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })
  it('never counts a light session as a PR or as the one to beat', () => {
    // The light 19 Oct session (28 x 10) would block the 26 Oct PR if it counted.
    expect(md).toContain('e1RM 35, up from 33')
    // The light 19 Oct session is the heaviest dumbbell session so far, yet it is not a PR in its own week.
    const light = weeklySummary(fixture(), weekOf('2026-10-19'), GEN)
    expect(light).not.toContain('- PR:')
  })
  it('marks a rough PR estimate with "~" on the new value only', () => {
    const f = fixture()
    f.sets = f.sets.map((s) => (s.workoutId === 'w26' && s.exerciseId === dbBench.id ? { ...s, weightKg: 24, reps: 12 } : s))
    expect(weeklySummary(f, W44, GEN)).toContain('- PR: Dumbbell Bench Press · e1RM ~34, up from 33 · Mon 26 Oct')
  })
  it('shows one decimal on both PR estimates when the whole numbers tie', () => {
    const f = fixture()
    // 24.5 x 11 is 33.48 against 25 x 10 at 33.33: both round to 33
    f.sets = f.sets.map((s) => (s.workoutId === 'w26' && s.exerciseId === dbBench.id ? { ...s, weightKg: 24.5, reps: 11 } : s))
    expect(weeklySummary(f, W44, GEN)).toContain('- PR: Dumbbell Bench Press · e1RM ~33.5, up from 33.3 · Mon 26 Oct')
  })
  it('words a PR for a bodyweight lift as its best set', () => {
    const f = fixture()
    const bw: Exercise = { ...dbBench, id: 'chin', name: 'Chin Up', loadMode: 'bodyweight_plus' }
    f.exercises = [...f.exercises, bw]
    f.sets = [...f.sets, set('d12', 'chin', { weightKg: 10, reps: 8 }), set('d17', 'chin', { weightKg: 10, reps: 9 }), set('w26', 'chin', { weightKg: 10, reps: 10 })]
    expect(weeklySummary(f, W44, GEN)).toContain('- PR: Chin Up · best set 10 reps at BW+10 · Mon 26 Oct')
  })
  it('writes a drop taken and marks a running light week', () => {
    const f = fixture()
    f.sets = f.sets.map((s) => (s.coach === 'reset' ? { ...s, coach: 'drop' as const } : s))
    f.coach = { lightWeeks: [{ startedAt: '2026-10-19T09:00:00+08:00', endsAt: '2026-11-02T09:00:00+08:00' }] }
    const out = weeklySummary(f, W44, GEN)
    expect(out).toContain('- Drop taken: Leg Press (Tampines West machine) · to 95 · Sat 31 Oct')
    expect(out).not.toContain('- Reset taken')
    expect(out).toContain('- Light week: Mon 19 Oct to Mon 2 Nov (running)')
  })
  it('omits the Coach section on a quiet week', () => {
    const f = fixture()
    f.coach = { lightWeeks: [] }
    f.workouts = f.workouts.filter((w) => ['w3', 'w10'].includes(w.id))
    f.sets = f.sets.filter((s) => ['w3', 'w10'].includes(s.workoutId))
    const out = weeklySummary(f, weekOf('2026-10-10'), GEN)
    expect(out).toContain('## Strength, by exercise')
    expect(out).not.toContain('## Coach')
  })
  it('adds hard sets to the muscle line', () => {
    expect(md).toMatch(/## Working sets per muscle this week\nLegs \d+ \(hard 3\) · /)
    expect(md).toMatch(/Core 0 \(hard 0\)/)
  })
  it('keeps the section order', () => {
    const order = ['## Sessions', '## Coach', '## Strength, by exercise', '## Working sets per muscle', '## Cardio', '## Bodyweight', '## Notes'].map((h) => md.indexOf(h))
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })
})

describe('weeklySummary notes', () => {
  it('keeps a multi-line note on one bullet', () => {
    const f = fixture()
    f.workouts = f.workouts.map((w) => (w.id === 'w31' ? { ...w, notes: 'Felt strong\n\n  Knee a bit tight' } : w))
    expect(weeklySummary(f, W44, GEN)).toContain('- Sat 31 Oct: "Felt strong Knee a bit tight"')
  })
})

describe('weeklySummary with an empty week', () => {
  it('says so and omits the other sections', () => {
    const md = weeklySummary({ ...fixture(), workouts: [], sets: [], cardio: [], bodyweight: [] }, W44, GEN)
    expect(md).toContain('## Sessions\nNo sessions this week.')
    expect(md).not.toContain('## Strength')
    expect(md).not.toContain('## Working sets')
    expect(md).not.toContain('## Cardio')
    expect(md).not.toContain('## Bodyweight')
    expect(md).not.toContain('## Notes')
  })
})

describe('weeklyFileName', () => {
  it('uses the ISO year and a two-digit week', () => {
    expect(weeklyFileName(W44)).toBe('gymlog-week-2026-W44.md')
    expect(weeklyFileName(weekOf('2026-01-01'))).toBe('gymlog-week-2026-W01.md')
  })
})
