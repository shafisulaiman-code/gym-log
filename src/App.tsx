import { useEffect, useRef, useState } from 'react'
import { findActiveWorkout, setupDb } from './db'
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
  // Tracks whether we pushed a browser history entry, so Android's back button returns Home.
  const pushed = useRef(false)

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
    const onPop = () => {
      pushed.current = false
      setScreen({ name: 'home' })
    }
    window.addEventListener('popstate', onPop)
    return () => {
      cancelled = true
      window.removeEventListener('popstate', onPop)
    }
  }, [])

  function open(next: Screen) {
    if (!pushed.current) {
      history.pushState(null, '')
      pushed.current = true
    }
    setScreen(next)
  }

  function goHome() {
    if (pushed.current) history.back() // triggers popstate, which shows Home
    else setScreen({ name: 'home' })
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
