// Same hand-rolled inline-SVG pattern as PnlChart.jsx (no charting library
// in this project) - simpler than that one since a count is never "bad",
// so there's no tone-flipping, just a fixed accent line.

export default function AdminTimeSeriesChart({ data, label }) {
  if (data.length < 2) return null

  const width = 300
  const height = 80
  const padY = 8
  const points = data.map((d) => d.count)
  const min = Math.min(0, ...points)
  const max = Math.max(0, ...points)
  const range = max - min || 1
  const scaleX = (i) => (i / (points.length - 1)) * width
  const scaleY = (v) => height - padY - ((v - min) / range) * (height - padY * 2)

  const path = points.map((v, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(i).toFixed(1)} ${scaleY(v).toFixed(1)}`).join(' ')
  const zeroY = scaleY(0)
  const total = points.reduce((sum, v) => sum + v, 0)

  return (
    <div className="pnl-chart">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="pnl-chart-svg">
        <line x1="0" y1={zeroY} x2={width} y2={zeroY} className="pnl-chart-zero" />
        <path d={path} className="pnl-chart-line tone-good" />
      </svg>
      <div className="pnl-chart-caption">
        {label}: {total} over the last {points.length} days
      </div>
    </div>
  )
}
