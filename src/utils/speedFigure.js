// Scales a horse's raw speed figure (a Racing Post "Topspeed"-style number -
// how fast the horse has actually run, not a handicapper's opinion) into a
// 0-100 bar width and a coarse tier, relative to the fastest figure in its
// OWN race. An absolute number like "112" means little to a casual punter,
// but "this bar is the longest in the race" reads instantly - which is the
// whole point of showing it on the always-visible runner row rather than
// buried in the tap-to-expand form.
//
// Returns null for missing/invalid input (not every runner has a figure, and
// mock data mirrors that patchiness) so callers can render nothing at all
// rather than a zero-width bar.
export function speedFigureBar(value, max) {
  const v = Number(value)
  const m = Number(max)
  if (!Number.isFinite(v) || v <= 0 || !Number.isFinite(m) || m <= 0) return null
  // Floor the width at 6% so even the slowest horse in a race still shows a
  // visible stub rather than an empty track that reads as "no data".
  const pct = Math.max(6, Math.min(100, Math.round((v / m) * 100)))
  const tier = v >= m ? 'top' : pct >= 85 ? 'high' : pct >= 60 ? 'mid' : 'low'
  return { pct, tier, value: v }
}
