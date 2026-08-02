import { apiKeysForSport } from '../lib/sportsConfig.js'

// Recently completed games for a sport, straight from the same /api/scores
// function src/lib/settlement.js uses to auto-settle bets - lets someone
// check a final score even for a fixture they never bet on. Sports without
// a live-score mapping (racing, tennis - see apiKeysForSport) just come
// back empty, same as "nothing on right now" elsewhere in the app.
export async function fetchResults(sport) {
  const keys = apiKeysForSport(sport)
  if (!keys.length) return []
  const res = await fetch(`/api/scores?keys=${encodeURIComponent(keys.join(','))}`)
  if (!res.ok) throw new Error(`Failed to load results: ${res.status}`)
  return res.json()
}
