// Bankroll trajectory over time - same plain-inline-SVG approach as
// PnlChart.jsx, but the baseline is the user's own set bankroll figure
// instead of zero, and each point is bankroll + cumulative settled P&L
// rather than P&L alone. Opt-in: renders nothing without a bankroll figure
// set (see AccountPage.jsx's "Bankroll & staking plan" section), same
// silent-absence contract PnlChart already uses for <2 settled bets.

export default function BankrollChart({ entries, bankrollAmount }) {
  if (!bankrollAmount) return null

  const settled = entries
    .filter((e) => e.stake && e.settledAt && ['won', 'lost', 'void'].includes(e.status))
    .sort((a, b) => new Date(a.settledAt) - new Date(b.settledAt))

  if (settled.length < 2) return null

  const start = Number(bankrollAmount)
  let running = start
  const points = [
    start,
    ...settled.map((e) => {
      if (e.status === 'won') running += Number(e.potentialReturn) - Number(e.stake)
      else if (e.status === 'lost') running -= Number(e.stake)
      return running
    })
  ]

  const width = 300
  const height = 80
  const padY = 8
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1
  const scaleX = (i) => (i / (points.length - 1)) * width
  const scaleY = (v) => height - padY - ((v - min) / range) * (height - padY * 2)

  const path = points.map((v, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(i).toFixed(1)} ${scaleY(v).toFixed(1)}`).join(' ')
  const startY = scaleY(start)
  const final = points[points.length - 1]

  return (
    <div className="pnl-chart">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="pnl-chart-svg">
        <line x1="0" y1={startY} x2={width} y2={startY} className="pnl-chart-zero" />
        <path d={path} className={final >= start ? 'pnl-chart-line tone-good' : 'pnl-chart-line tone-bad'} />
      </svg>
      <div className="pnl-chart-caption">
        Bankroll £{final.toFixed(2)} (started at £{start.toFixed(2)}) across your last {settled.length} settled bets
      </div>
    </div>
  )
}
