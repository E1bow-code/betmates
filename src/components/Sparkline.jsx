// Tiny inline price-history trend line for an outcome (see the price series
// in src/lib/oddsMemory.js). Renders nothing until there are at least two
// points to draw a line between. Deliberately not colored good/bad - like the
// movement arrow, whether a drift is "good" depends on which side you're on -
// so it takes its colour from the surrounding text via currentColor.
export default function Sparkline({ points, width = 52, height = 16 }) {
  if (!points || points.length < 2) return null

  const prices = points.map((pt) => pt.p)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const range = max - min || 1 // flat series: draw a centred straight line
  const n = points.length

  const coords = points.map((pt, i) => {
    const x = (i / (n - 1)) * (width - 2) + 1
    const y = height - 1 - ((pt.p - min) / range) * (height - 2)
    return [x, y]
  })
  const d = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const [lastX, lastY] = coords[n - 1]

  const first = prices[0]
  const latest = prices[n - 1]
  const trend = latest > first ? 'drifted' : latest < first ? 'shortened' : 'held steady'

  return (
    <svg
      className="odds-sparkline"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Price ${trend} over your last ${n} views`}
    >
      <title>{`Best price ${trend} over your last ${n} views`}</title>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r="1.6" fill="currentColor" />
    </svg>
  )
}
