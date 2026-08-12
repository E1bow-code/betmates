import { speedFigureBar } from '../utils/speedFigure.js'

// Always-visible speed-figure indicator for one runner, shown on the runner
// summary row (not behind the tap-to-expand form) so a whole race's pace can
// be compared at a glance. `max` is the fastest figure among the race's
// runners - the bar is scaled against that, so the longest bar in the list
// is the fastest horse. Renders nothing when a runner has no figure.
export default function SpeedFigure({ value, max }) {
  const bar = speedFigureBar(value, max)
  if (!bar) return null
  const isTop = bar.tier === 'top'
  return (
    <div
      className="speed-fig"
      title={`Speed figure ${bar.value}${isTop ? ' - fastest in the race' : ''}`}
      aria-label={`Speed figure ${bar.value} out of ${Number(max)}${isTop ? ', fastest in the race' : ''}`}
    >
      <span className="speed-fig-label">SPD</span>
      <span className="speed-fig-track">
        <span className={`speed-fig-fill speed-fig-${bar.tier}`} style={{ width: `${bar.pct}%` }} />
      </span>
      <span className="speed-fig-value">{bar.value}</span>
      {isTop && <span className="speed-fig-top">Fastest</span>}
    </div>
  )
}
