// Turns a horse's rating into a 0-100 bar width + a coarse tier for the
// per-runner indicator on RaceDetailPage. The rating is a true speed figure
// when the feed carries one, otherwise a Racing Post Rating, otherwise the
// official rating (see pickRatingMetric) - the bar looks and works the same
// either way.
//
// Scaled across the SPREAD of the race (min..max), not 0..max: ratings in a
// handicap sit in a narrow band (a Class 4 might run OR 70-92), so scaling
// from zero would make every bar look nearly full and identical. Spreading
// min->max instead makes the difference between horses actually visible,
// which is the entire point of the indicator.
//
// Returns null for missing/invalid input (not every runner is rated, and the
// live feed is patchy) so callers render nothing rather than an empty bar.
export function ratingBar(value, min, max) {
  const v = Number(value)
  const lo = Number(min)
  const hi = Number(max)
  if (!Number.isFinite(v) || v <= 0 || !Number.isFinite(hi) || hi <= 0) return null
  const span = Number.isFinite(lo) && hi > lo ? hi - lo : 0
  const raw = span > 0 ? (v - lo) / span : 1
  // Floor at 14% so the lowest-rated horse still shows a readable stub rather
  // than an empty track that reads as "no data".
  const pct = Math.max(14, Math.min(100, Math.round(raw * 100)))
  const tier = v >= hi ? 'top' : raw >= 0.66 ? 'high' : raw >= 0.33 ? 'mid' : 'low'
  return { pct, tier, value: v }
}

// The metrics the bar can show, best first. A real speed figure is the ideal
// (it's what the horse actually ran, not an opinion), but theracingapi's
// standard racecards don't include a Topspeed figure, so live UK/Irish
// racing falls back to the Racing Post Rating, then the official rating. The
// mock feed does carry speedFigure, so the demo shows a real "SPD" bar.
const METRICS = [
  { key: 'speedFigure', label: 'SPD', name: 'speed figure', topTag: 'Fastest', better: 'faster' },
  { key: 'racingPostRating', label: 'RPR', name: 'Racing Post Rating', topTag: 'Top rated', better: 'higher' },
  { key: 'officialRating', label: 'OR', name: 'official rating', topTag: 'Top rated', better: 'higher' }
]

// Picks ONE metric for the whole race and returns it with the field min/max,
// or null if the race carries none. One metric per race matters: every bar is
// scaled against the same yardstick, so mixing a speed figure on one runner
// with an official rating on another - which would make the bar lengths
// meaningless to compare - can't happen. A metric qualifies once at least
// half the runners carry it.
export function pickRatingMetric(runners) {
  if (!runners?.length) return null
  const enough = Math.ceil(runners.length / 2)
  for (const metric of METRICS) {
    const values = runners.map((r) => Number(r[metric.key])).filter((n) => Number.isFinite(n) && n > 0)
    if (values.length >= enough) {
      return { ...metric, min: Math.min(...values), max: Math.max(...values) }
    }
  }
  return null
}
