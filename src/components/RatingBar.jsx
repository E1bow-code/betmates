import { ratingBar } from '../utils/ratingBar.js'

// Always-visible rating indicator for one runner, shown on the runner summary
// row (not behind the tap-to-expand form) so a whole race can be compared at
// a glance. `metric` comes from pickRatingMetric() for the race - it carries
// the field key's label (SPD / RPR / OR), the race min/max the bar scales
// against, and the wording for the top-of-race tag. Renders nothing when the
// race has no ratings or this runner lacks one.
export default function RatingBar({ value, metric }) {
  if (!metric) return null
  const bar = ratingBar(value, metric.min, metric.max)
  if (!bar) return null
  const isTop = bar.tier === 'top'
  const topPhrase = `${metric.topTag.toLowerCase()} in the race`
  return (
    <div
      className="rating-bar"
      title={`${metric.label} ${bar.value}${isTop ? ` - ${topPhrase}` : ''}`}
      aria-label={`${metric.name} ${bar.value}${isTop ? `, ${topPhrase}` : ''}`}
    >
      <span className="rating-bar-label">{metric.label}</span>
      <span className="rating-bar-track">
        <span className={`rating-bar-fill rating-bar-${bar.tier}`} style={{ width: `${bar.pct}%` }} />
      </span>
      <span className="rating-bar-value">{bar.value}</span>
      {isTop && <span className="rating-bar-top">{metric.topTag}</span>}
    </div>
  )
}
