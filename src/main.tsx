import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

async function start() {
  // Dev-server-only test data (?seed=coach, ?seed=clear); see devSeed.ts.
  if (import.meta.env.DEV) {
    const { runDevSeed } = await import('./devSeed')
    await runDevSeed()
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

start()
