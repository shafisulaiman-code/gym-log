import { useEffect, useState } from 'react'
import { findActiveWorkout, setupDb } from './db'
import { popAll, pushLayer } from './nav'
import Home from './screens/Home'
import Workout from './screens/Workout'
import Cardio from './screens/Cardio'
import BodyweightEntry from './screens/BodyweightEntry'

type Screen =
  | { name: 'loading' }
  | { name: 'home' }
  | { name: 'workout'; workoutId: string }
  | { name: 'cardio' }
  | { name: 'bodyweight' }

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'loading' })

  useEffect(() => {
    let cancelled = false
    setupDb()
      .then(findActiveWorkout)
      .then((active) => {
        if (cancelled) return
        // Reopening the app mid-workout goes straight back to the workout.
        if (active) open({ name: 'workout', workoutId: active.id })
        else setScreen({ name: 'home' })
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Every non-home screen is one history layer, so Android back returns Home.
  function open(next: Screen) {
    pushLayer(() => setScreen({ name: 'home' }))
    setScreen(next)
  }

  // Home is depth 0; a screen may have a sheet or picker open above it, so pop everything.
  function goHome() {
    popAll()
  }

  switch (screen.name) {
    case 'loading':
      return null
    case 'home':
      return (
        <Home
          onOpenWorkout={(workoutId) => open({ name: 'workout', workoutId })}
          onCardio={() => open({ name: 'cardio' })}
          onBodyweight={() => open({ name: 'bodyweight' })}
        />
      )
    case 'workout':
      return <Workout key={screen.workoutId} workoutId={screen.workoutId} onDone={goHome} />
    case 'cardio':
      return <Cardio onDone={goHome} />
    case 'bodyweight':
      return <BodyweightEntry onDone={goHome} />
  }
}
