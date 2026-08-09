import { apiKeysForSport, sgoLeagueForSport } from '../lib/sportsConfig.js'

// Recently completed games for a sport, straight from the same /api/scores
// function src/lib/settlement.js uses to auto-settle bets - lets someone
// check a final score even for a fixture they never bet on. The four
// SportsGameOdds-backed sports (basketball/hockey/baseball/nfl) go through
// sgoLeague instead of keys, since they have no Odds-API mapping at all.
// Sports without either (racing) just come back empty, same as "nothing on
// right now" elsewhere in the app.
export async function fetchResults(sport) {
  const keys = apiKeysForSport(sport)
  const sgoLeague = sgoLeagueForSport(sport)
  if (!keys.length && !sgoLeague) return []

  const params = new URLSearchParams()
  if (keys.length) params.set('keys', keys.join(','))
  if (sgoLeague) params.set('sgoLeague', sgoLeague)

  const res = await fetch(`/api/scores?${params}`)
  if (!res.ok) throw new Error(`Failed to load results: ${res.status}`)
  return res.json()
}
