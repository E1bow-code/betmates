// A visible track-record badge for profiles/records pages, built from the
// same computeStats() numbers Tracker already shows - no separate data
// source, just a threshold read on winRate/decidedCount. Gated on a decent
// sample size (decidedCount) so a lucky 2/2 run doesn't read as "sharp" -
// most sports betting has a bookmaker margin baked in, so a raw win rate
// this high sustained over a real sample is a genuinely good signal.
export function tipsterBadge(stats) {
  if (!stats || stats.winRate === null) return null
  if (stats.decidedCount >= 20 && stats.winRate >= 55) return { icon: '🎯', label: 'Sharp Bettor' }
  if (stats.decidedCount >= 10 && stats.winRate >= 50) return { icon: '✅', label: 'Reliable Tipster' }
  return null
}
