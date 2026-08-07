// Proxy to The Odds API's /scores endpoint, used by src/lib/settlement.js to
// auto-settle bets (see TrackerPage) instead of the user having to manually
// mark every bet won/lost. `keys` is a comma list of API sport keys the
// client already knows it needs (derived from open bets' legs) so this
// never fetches more than necessary. daysFrom=3 is the free-tier max
// lookback - a bet on a game older than that still needs manual settling.
//
// Cached per sport key (see src/lib/apiCache.js) rather than per whole
// request, since different callers ask for different key combinations -
// TrackerPage loading twice in a few minutes for the same sports shouldn't
// cost credits twice.
import { cacheGet, cacheSet } from '../../src/lib/apiCache.js'

const SCORES_TTL = 3 * 60 * 1000
// In-play scores change by the minute, so the live view caches far more
// briefly than the completed-game data settlement reads.
const LIVE_TTL = 30 * 1000

export default async (req) => {
  const apiKey = process.env.ODDS_API_KEY
  const url = new URL(req.url)
  const keys = (url.searchParams.get('keys') ?? '').split(',').filter(Boolean)
  // Default is completed games only - the shape settlement.js and the
  // Results tab depend on. `state=live` opts into in-play games instead and
  // is only used by the Tracker's live-score strip; the two are cached
  // separately so neither can serve the other's stale data.
  const live = url.searchParams.get('state') === 'live'

  if (!apiKey || !keys.length) {
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'content-type': 'application/json', 'x-data-source': apiKey ? 'live' : 'mock' }
    })
  }

  const cachePrefix = live ? 'scores-live' : 'scores'
  const ttl = live ? LIVE_TTL : SCORES_TTL

  try {
    const results = await Promise.allSettled(
      keys.map(async (sportKey) => {
        const cached = cacheGet(`${cachePrefix}-${sportKey}`)
        if (cached) return cached
        const apiUrl = `https://api.the-odds-api.com/v4/sports/${sportKey}/scores/?apiKey=${apiKey}&daysFrom=3`
        const res = await fetch(apiUrl)
        if (!res.ok) throw new Error(`${sportKey}: ${res.status}`)
        const events = await res.json()
        cacheSet(`${cachePrefix}-${sportKey}`, events, ttl)
        return events
      })
    )

    const events = results.filter((r) => r.status === 'fulfilled').flatMap((r) => r.value)
    // A game in progress reports scores with completed=false; a finished one
    // with completed=true. Each view wants exactly one of those.
    const games = events
      .filter((e) => (live ? !e.completed : e.completed) && e.scores)
      .map((e) => ({
        homeTeam: e.home_team,
        awayTeam: e.away_team,
        scores: e.scores.map((s) => ({ name: s.name, score: Number(s.score) }))
      }))

    return new Response(JSON.stringify(games), {
      status: 200,
      headers: { 'content-type': 'application/json', 'x-data-source': 'live' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    })
  }
}
