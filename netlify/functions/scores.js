// Proxy to two different score providers, used by src/lib/settlement.js to
// auto-settle bets (see TrackerPage) instead of the user having to manually
// mark every bet won/lost:
//   - `keys` - The Odds API sport keys (football, UFC, cricket, etc, plus
//     the TENNIS_DYNAMIC_KEY sentinel - see sportsConfig.js - which gets
//     expanded below into whichever tennis_* tournament keys are currently
//     active, the same discovery netlify/functions/sport.js does for
//     tennis odds).
//   - `sgoIds` - SportsGameOdds event IDs, for the four `provider: 'sgo'`
//     sports (basketball/hockey/baseball/nfl - see sportsConfig.js).
//     SportsGameOdds has no sport-wide /scores sweep; it's keyed by the
//     specific event a leg was struck on (leg.eventId), so the client
//     already knows exactly which IDs to ask about rather than this
//     function guessing a date window.
// Both are optional and independent - a request can ask for either, both,
// or neither. daysFrom=3 on the Odds API side is the free-tier max
// lookback - a bet on a game older than that still needs manual settling.
//
// Cached per key/id-batch (see src/lib/apiCache.js) rather than per whole
// request, since different callers ask for different combinations -
// TrackerPage loading twice in a few minutes for the same games shouldn't
// cost credits twice.
import { cacheGet, cacheSet } from '../../src/lib/apiCache.js'
import { TENNIS_DYNAMIC_KEY } from '../../src/lib/sportsConfig.js'
import { logProviderError } from '../../src/lib/logProviderError.js'

const SCORES_TTL = 3 * 60 * 1000
// In-play scores change by the minute, so the live view caches far more
// briefly than the completed-game data settlement reads.
const LIVE_TTL = 30 * 1000
const TENNIS_KEYS_TTL = 30 * 60 * 1000

async function resolveTennisKeys(apiKey) {
  const cached = cacheGet('scores-tennis-keys')
  if (cached) return cached
  const keys = await fetch(`https://api.the-odds-api.com/v4/sports/?apiKey=${apiKey}`)
    .then((r) => (r.ok ? r.json() : []))
    .then((sports) => sports.filter((s) => s.active && s.key.startsWith('tennis_')).map((s) => s.key))
    .catch(() => [])
  if (keys.length) cacheSet('scores-tennis-keys', keys, TENNIS_KEYS_TTL)
  return keys
}

async function fetchOddsApiGames(rawKeys, apiKey, live) {
  if (!apiKey || !rawKeys.length) return []
  const keys = rawKeys.includes(TENNIS_DYNAMIC_KEY)
    ? [...rawKeys.filter((k) => k !== TENNIS_DYNAMIC_KEY), ...(await resolveTennisKeys(apiKey))]
    : rawKeys
  if (!keys.length) return []

  const cachePrefix = live ? 'scores-live' : 'scores'
  const ttl = live ? LIVE_TTL : SCORES_TTL

  const results = await Promise.allSettled(
    keys.map(async (sportKey) => {
      const cached = cacheGet(`${cachePrefix}-${sportKey}`)
      if (cached) return cached
      // encodeURIComponent, not a raw interpolation - sportKey comes from
      // the client's own `keys` query param, unlike odds.js/sport.js
      // where the sport key is always drawn from a fixed, server-known
      // list. A raw `keys=x?apiKey=ATTACKER` would otherwise open a new
      // query context inside this URL's path segment, letting an
      // attacker's own params ride alongside (or replace) the real ones.
      const apiUrl = `https://api.the-odds-api.com/v4/sports/${encodeURIComponent(sportKey)}/scores/?apiKey=${apiKey}&daysFrom=3`
      const res = await fetch(apiUrl)
      if (!res.ok) throw new Error(`${sportKey}: ${res.status}`)
      const events = await res.json()
      cacheSet(`${cachePrefix}-${sportKey}`, events, ttl)
      return events
    })
  )

  // Unlike odds.js/ufc.js/sport.js's own fallback points, a rejected key
  // here never surfaced anywhere before - it silently dropped out of the
  // results below. This is the path auto-settle.js (every 30 min) and
  // alert-checks.js (every 15 min) hit, both with sport keys tied to real
  // open bets/followed fixtures - and since SCORES_TTL/LIVE_TTL are far
  // shorter than either cron interval, most of their calls land here
  // genuinely uncached. Logged once per request (not per key) so a
  // multi-sport rejection doesn't spam the admin error log.
  const rejected = results.filter((r) => r.status === 'rejected')
  if (rejected.length) await logProviderError('scores', rejected.map((r) => r.reason?.message).join('; '))

  const events = results.filter((r) => r.status === 'fulfilled').flatMap((r) => r.value)
  // A game in progress reports scores with completed=false; a finished one
  // with completed=true. Each view wants exactly one of those.
  return events
    .filter((e) => (live ? !e.completed : e.completed) && e.scores)
    .map((e) => ({
      homeTeam: e.home_team,
      awayTeam: e.away_team,
      scores: e.scores.map((s) => ({ name: s.name, score: Number(s.score) }))
    }))
}

// Shared by both SGO fetch modes below - one request's worth of events into
// this function's own {homeTeam, awayTeam, scores} shape, the same one the
// Odds API side already produces so betEvaluation.js/findGame never has to
// know which provider a game came from.
function reshapeSgoResults(events, live) {
  return events
    .filter((e) => (live ? e.status?.live === true : e.status?.completed === true))
    .filter((e) => Number.isFinite(e.teams?.home?.score) && Number.isFinite(e.teams?.away?.score))
    .map((e) => ({
      homeTeam: e.teams.home.names?.long,
      awayTeam: e.teams.away.names?.long,
      scores: [
        { name: e.teams.home.names?.long, score: e.teams.home.score },
        { name: e.teams.away.names?.long, score: e.teams.away.score }
      ]
    }))
    .filter((g) => g.homeTeam && g.awayTeam)
}

// Settlement/live-scores path - the client already knows exactly which
// SportsGameOdds event(s) its open bets need (leg.eventId), so this asks
// about those specific IDs rather than sweeping a whole league.
async function fetchSgoGames(ids, sgoApiKey, live) {
  if (!sgoApiKey || !ids.length) return []
  const sorted = [...ids].sort()
  const cacheKey = `scores-sgo-${live ? 'live' : 'final'}-${sorted.join(',')}`
  const cached = cacheGet(cacheKey)
  if (cached) return cached

  const ttl = live ? LIVE_TTL : SCORES_TTL
  try {
    const apiUrl = `https://api.sportsgameodds.com/v2/events?eventIDs=${encodeURIComponent(sorted.join(','))}&apiKey=${sgoApiKey}`
    const res = await fetch(apiUrl)
    if (!res.ok) throw new Error(`SportsGameOdds scores: ${res.status}`)
    const body = await res.json()
    const games = reshapeSgoResults(body.data ?? [], live)
    cacheSet(cacheKey, games, ttl)
    return games
  } catch {
    // Same "degrade rather than error the whole response" contract as the
    // Odds API side - a SportsGameOdds hiccup shouldn't stop football/UFC
    // settlement from working.
    return []
  }
}

// "Browse recent results" path (src/api/resultsClient.js's Results tab) -
// not scoped to any one user's bets, so there's no specific eventId to ask
// about yet. Sweeps the last 3 days for the league instead, same lookback
// window the Odds API side uses (daysFrom=3 above).
async function fetchSgoLeagueGames(league, sgoApiKey) {
  if (!sgoApiKey || !league) return []
  const cacheKey = `scores-sgo-league-${league}`
  const cached = cacheGet(cacheKey)
  if (cached) return cached

  try {
    const startsAfter = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
    // encodeURIComponent - league is the client's own `sgoLeague` query
    // param with no whitelist check, unlike fetchSgoGames' eventIDs above
    // which already encodes. Unencoded, a value like
    // "X&apiKey=ATTACKER&limit=9999" appends straight onto this query
    // string with no new-context trick even needed.
    const apiUrl = `https://api.sportsgameodds.com/v2/events?leagueID=${encodeURIComponent(league)}&finalized=true&startsAfter=${startsAfter}&limit=25&apiKey=${sgoApiKey}`
    const res = await fetch(apiUrl)
    if (!res.ok) throw new Error(`SportsGameOdds results: ${res.status}`)
    const body = await res.json()
    const games = reshapeSgoResults(body.data ?? [], false)
    cacheSet(cacheKey, games, SCORES_TTL)
    return games
  } catch {
    return []
  }
}

export default async (req) => {
  const url = new URL(req.url)
  const keys = (url.searchParams.get('keys') ?? '').split(',').filter(Boolean)
  const sgoIds = (url.searchParams.get('sgoIds') ?? '').split(',').filter(Boolean)
  const sgoLeague = url.searchParams.get('sgoLeague')
  // Default is completed games only - the shape settlement.js and the
  // Results tab depend on. `state=live` opts into in-play games instead and
  // is only used by the Tracker's live-score strip; the two are cached
  // separately so neither can serve the other's stale data.
  const live = url.searchParams.get('state') === 'live'

  const apiKey = process.env.ODDS_API_KEY
  const sgoApiKey = process.env.SGO_API_KEY

  if ((!apiKey || !keys.length) && (!sgoApiKey || (!sgoIds.length && !sgoLeague))) {
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'content-type': 'application/json', 'x-data-source': apiKey || sgoApiKey ? 'live' : 'mock' }
    })
  }

  try {
    const [oddsApiGames, sgoGames, sgoLeagueGames] = await Promise.all([
      fetchOddsApiGames(keys, apiKey, live),
      fetchSgoGames(sgoIds, sgoApiKey, live),
      sgoLeague ? fetchSgoLeagueGames(sgoLeague, sgoApiKey) : Promise.resolve([])
    ])

    return new Response(JSON.stringify([...oddsApiGames, ...sgoGames, ...sgoLeagueGames]), {
      status: 200,
      headers: { 'content-type': 'application/json', 'x-data-source': 'live' }
    })
  } catch (err) {
    // Generic message, not err.message - every sibling proxy in this
    // directory only logs its own error server-side and returns an
    // empty/mock body, never reflects it to the caller. This one didn't
    // match that, and low-level fetch failures at this layer are
    // documented to sometimes embed the full request URL - including
    // ?apiKey=... - in their message.
    console.error('scores.js handler error:', err.message)
    return new Response(JSON.stringify({ error: 'Failed to fetch scores' }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    })
  }
}
