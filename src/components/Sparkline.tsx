import { sparkLayout } from '../historyView'

// The e1RM line over the shown sessions, oldest first. Solid dots are estimates from
// ten reps or fewer, hollow dots are rough ones; the best one is bigger and bright.
export default function Sparkline({ points }: { points: { kg: number; rough: boolean; best: boolean }[] }) {
  const at = sparkLayout(points.map((p) => p.kg))
  return (
    <svg className="spark" viewBox="0 0 380 120" preserveAspectRatio="none" role="img" aria-label="e1RM over the last sessions">
      {[20, 60, 100].map((y) => (
        <line key={y} className="spark-grid" x1="0" y1={y} x2="380" y2={y} />
      ))}
      <polyline className="spark-line" points={at.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} />
      {points.map((p, i) => (
        <circle
          key={i}
          className={`spark-dot${p.rough ? ' rough' : ''}${p.best ? ' best' : ''}`}
          cx={at[i].x}
          cy={at[i].y}
          r={p.best ? 6 : 4}
        />
      ))}
    </svg>
  )
}
