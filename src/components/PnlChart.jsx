// Cumulative P&L over time as a plain inline SVG line - no charting
// library, just enough to show the shape of a run (streaks, drawdowns)
// that the four stat tiles above it can't convey on their own.

export default function PnlChart({ entries }) {
  const settled = entries
    .filter((e) => e.stake && e.settledAt && ['won', 'lost', 'void'].includes(e.status))
    .sort((a, b) => new Date(a.settledAt) - new Date(b.settledAt))

  if (settled.length < 2) return null

  let running = 0
  const points = settled.map((e) => {
    if (e.status === 'won') running += Number(e.potentialReturn) - Number(e.stake)
    else if (e.status === 'lost') running -= Number(e.stake)
    return running
  })

  const width = 300
  const height = 80
  const padY = 8
  const min = Math.min(0, ...points)
  const max = Math.max(0, ...points)
  const range = max - min || 1
  const scaleX = (i) => (i / (points.length - 1)) * width
  const scaleY = (v) => height - padY - ((v - min) / range) * (height - padY * 2)

  const path = points.map((v, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(i).toFixed(1)} ${scaleY(v).toFixed(1)}`).join(' ')
  const zeroY = scaleY(0)
  const final = points[points.length - 1]

  return (
    <div className="pnl-chart">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="pnl-chart-svg">
        <line x1="0" y1={zeroY} x2={width} y2={zeroY} className="pnl-chart-zero" />
        <path d={path} className={final >= 0 ? 'pnl-chart-line tone-good' : 'pnl-chart-line tone-bad'} />
      </svg>
      <div className="pnl-chart-caption">P&L across your last {points.length} settled bets</div>
    </div>
  )
}
