// Scheduled function (see `config.schedule` below) - the ingest half of
// BetMates' own football-odds API. Fetches the bulk odds list from The Odds
// API, reshapes it with src/lib/footballOddsShape.js (the SAME transform the
// live proxy uses, so the two can't drift), and upserts the assembled list
// into the odds_cache table. netlify/functions/odds.js then serves every
// user's bulk-list request straight from that row - zero Odds API credits per
// user, no matter how many users or cold starts.
//
// This is the whole point of Level 1 "own the serving layer": the ONLY thing
// that spends Odds API credits on the list is this cron, on a fixed schedule
// we control. Cost stops scaling with traffic and becomes predictable.
//
// Free-tier budget math (the constraint - see src/lib/apiCache.js). The list
// is 5 leagues = 5 credits per run. The free tier is 500 requests/month:
//   every 8h  -> 5 x 3/day  x 30 = 450/month  (under 500 - the default)
//   every 6h  -> 5 x 4/day  x 30 = 600/month  (just over)
//   every 20m -> 5 x 72/day x 30 = 10,800/month (needs a paid tier)
// So on the free tier the odds are hours stale - inherent to 500 req/month,
// not something any caching layer fixes. Fresh odds are exactly why you'd move
// off the free tier, and then this is the ONE dial to turn up. Left at the
// free-tier-safe default; raise the cadence when the plan allows.
//
// Runs on the service-role key like every other scheduled function - nobody's
// signed in when a cron fires. Reads nothing user-specific here; it needs the
// service role only to WRITE odds_cache (RLS gives that table no insert policy,
// so only the service role can populate it - the proxy reads it with anon).
import { createClient } from '@supabase/supabase-js'
import { FOOTBALL_SPORT_KEYS } from '../../src/lib/sportsConfig.js'
import { reshapeEvent } from '../../src/lib/footballOddsShape.js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ODDS_API_KEY = process.env.ODDS_API_KEY
const REGION = 'uk'
const MARKETS = 'h2h,totals'

function json(body) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

async function fetchSportOdds(sport) {
  const apiUrl = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${ODDS_API_KEY}&regions=${REGION}&markets=${MARKETS}&oddsFormat=decimal&includeLinks=true`
  const res = await fetch(apiUrl)
  if (!res.ok) throw new Error(`${sport}: ${res.status}`)
  return res.json()
}

export default async () => {
  // Master off-switch. This whole odds-cache system spends real Odds API
  // credits, so it ships dormant: no ingest cron does anything until
  // ODDS_INGEST_ENABLED is explicitly set to 'true' in Netlify (turn it on only
  // after the odds_cache table exists). Until then the proxies keep serving
  // live/mock exactly as before - merging this never starts a cost clock.
  if (process.env.ODDS_INGEST_ENABLED !== 'true') {
    return json({ ingested: 0, reason: 'ingest disabled' })
  }

  // No key configured anywhere - nothing to ingest, and the proxy keeps
  // serving mock. Not an error (the app runs with zero keys by design).
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ODDS_API_KEY) {
    return json({ ingested: 0, reason: 'not configured' })
  }

  try {
    const results = await Promise.allSettled(FOOTBALL_SPORT_KEYS.map(fetchSportOdds))
    const events = results.filter((r) => r.status === 'fulfilled').flatMap((r) => r.value)

    // Every league failed (quota exhausted, outage) - leave the existing
    // odds_cache row untouched so the proxy keeps serving the last good list
    // (until DB_MAX_AGE), rather than blanking it. A partial success still
    // writes: a fresher list missing one league beats a stale full one.
    if (!events.length) {
      return json({ ingested: 0, reason: 'no upstream data' })
    }

    const fixtures = events.map(reshapeEvent).sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff))

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { error } = await supabase
      .from('odds_cache')
      .upsert({ cache_key: 'football-list', sport: 'football', payload: fixtures, fetched_at: new Date().toISOString() }, { onConflict: 'cache_key' })
    if (error) throw new Error(error.message)

    return json({ ingested: fixtures.length })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return json({ ingested: 0, error: message })
  }
}

export const config = {
  // Every 8 hours = 3 runs/day x 5 leagues = 450 Odds API credits/month, under
  // the 500 free-tier cap. See the budget math in the header before changing.
  schedule: '0 */8 * * *'
}
