// Scheduled function - the ingest half of BetMates' own UFC-odds API. Fetches
// the MMA list from The Odds API, reshapes it with src/lib/ufcOddsShape.js (the
// SAME transform netlify/functions/ufc.js uses live), and upserts it into the
// odds_cache table. ufc.js then serves every user's request from that row at
// zero Odds API credits. See netlify/functions/odds-ingest.js for the fuller
// write-up of why this exists.
//
// Free-tier budget: one league = 1 credit per run. Trivially cheap - even at a
// far higher cadence than the football list (5 credits/run) this barely dents
// the 500 req/month tier. Kept at the same 8h cadence as the football cron for
// consistency; there's headroom to raise it well before the budget bites.
import { createClient } from '@supabase/supabase-js'
import { UFC_SPORT_KEY } from '../../src/lib/sportsConfig.js'
import { reshapeEvent } from '../../src/lib/ufcOddsShape.js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ODDS_API_KEY = process.env.ODDS_API_KEY
const REGION = 'uk'
const MARKETS = 'h2h'
// Mirror ufc.js's near-term window so the durable cache never stores the
// speculative far-future "cards" the MMA feed carries (see ufc.js's
// MAX_DAYS_AHEAD for the why). Keeps the DB clean rather than relying only on
// the proxy filtering junk back out at serve time.
const MAX_DAYS_AHEAD = 60

function json(body) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

export default async () => {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ODDS_API_KEY) {
    return json({ ingested: 0, reason: 'not configured' })
  }

  try {
    const apiUrl = `https://api.the-odds-api.com/v4/sports/${UFC_SPORT_KEY}/odds/?apiKey=${ODDS_API_KEY}&regions=${REGION}&markets=${MARKETS}&oddsFormat=decimal&includeLinks=true`
    const res = await fetch(apiUrl)
    if (!res.ok) throw new Error(`${UFC_SPORT_KEY}: ${res.status}`)
    const events = await res.json()

    // No card on right now - leave the existing row untouched rather than
    // blanking it (the proxy's DB_MAX_AGE handles genuinely stale rows).
    if (!events.length) return json({ ingested: 0, reason: 'no upstream data' })

    const cutoff = Date.now() + MAX_DAYS_AHEAD * 24 * 60 * 60 * 1000
    const fights = events
      .map(reshapeEvent)
      .filter((f) => new Date(f.kickoff).getTime() <= cutoff)
      .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff))

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { error } = await supabase
      .from('odds_cache')
      .upsert({ cache_key: 'ufc-list', sport: 'ufc', payload: fights, fetched_at: new Date().toISOString() }, { onConflict: 'cache_key' })
    if (error) throw new Error(error.message)

    return json({ ingested: fights.length })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return json({ ingested: 0, error: message })
  }
}

export const config = {
  // One credit per run - see the header. Same 8h cadence as odds-ingest.js.
  schedule: '0 */8 * * *'
}
