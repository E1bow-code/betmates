// Proxy between the frontend and BetMates' own football-odds store, keeping
// ODDS_API_KEY server-side. Serves the
// { id, competition, homeTeam, awayTeam, kickoff, markets: [...] } shape used
// by src/data/mockFootballOdds.js, so UI code doesn't change when
// src/api/oddsClient.js switches off mock mode.
//
// Read-through, in priority order:
//   1. odds_cache (Supabase) - the durable list written by the scheduled job
//      netlify/functions/odds-ingest.js. THIS is the "own sports API" layer:
//      once the cron has run, every user's bulk-list request is served from
//      our own database and costs zero Odds API credits, no matter how many
//      users or cold starts. Unlike src/lib/apiCache.js (in-memory, per warm
//      instance, gone on cold start) this is one shared copy for the whole
//      app that survives deploys.
//   2. The Odds API live - only when the DB row is missing or stale (cron
//      hasn't run yet after a fresh deploy, or has stopped). Keeps the page
//      working during a cold cache instead of serving mock to real users.
//   3. Sample odds (src/data/mockFootballOdds.js) - no key and no cache, or a
//      provider outage. "Missing keys degrade, they don't crash."
//
// Per-fixture DETAIL (player props + extra markets) stays an on-demand live
// call below: it's US-region/close-to-kickoff-only and two credits per
// fixture, so pre-fetching it for the whole board on a cron would be wasteful
// - only the fixtures someone actually opens pay for it, in-memory cached per
// id. The bulk list, the expensive-under-traffic part, is what the cron owns.
import { createClient } from '@supabase/supabase-js'
import { FOOTBALL_SPORT_KEYS } from '../../src/lib/sportsConfig.js'
import { cacheGet, cacheSet } from '../../src/lib/apiCache.js'
import { reshapeEvent, reshapePlayerMarkets, reshapeExtraMarkets, EXTRA_MARKET_LABELS } from '../../src/lib/footballOddsShape.js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
// Read-only public reference data (RLS: "anyone can read odds cache"), so the
// proxy uses the anon key - least privilege. Only the ingest cron writes, with
// the service-role key. Same split as the anon key shipping in the client
// bundle by design: reads are public, RLS is the access control.
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
const CACHE_KEY = 'football-list'

const SPORTS = FOOTBALL_SPORT_KEYS
const REGION = 'uk'
const MARKETS = 'h2h,totals'

// See src/lib/apiCache.js for why these are long. LIST_TTL bounds the
// in-memory live fallback; DETAIL_TTL bounds per-fixture enrichment.
const LIST_TTL = 20 * 60 * 1000
const DETAIL_TTL = 30 * 60 * 1000
// How stale a cron-written odds_cache row may be before the proxy ignores it
// and goes live. Comfortably past odds-ingest.js's cadence so a single missed
// run doesn't drop the whole app to live fetches (which is what the DB layer
// exists to avoid) - but short enough that a cron that has actually stopped
// doesn't serve hours-old prices forever.
const DB_MAX_AGE = 12 * 60 * 60 * 1000

function json(body, source) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', 'x-data-source': source }
  })
}

async function serveMock(id) {
  const { getMockFixtures, getMockFixture } = await import('../../src/data/mockFootballOdds.js')
  const body = id ? getMockFixture(id) : getMockFixtures()
  return json(body, 'mock')
}

// The durable list written by odds-ingest.js. Returns the reshaped fixtures
// array, or null when there's no fresh row (never throws - a DB hiccup should
// just fall through to the live path, not break the page).
async function readCachedList() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    const { data } = await supabase.from('odds_cache').select('payload, fetched_at').eq('cache_key', CACHE_KEY).maybeSingle()
    if (!data) return null
    if (Date.now() - new Date(data.fetched_at).getTime() > DB_MAX_AGE) return null
    return data.payload
  } catch {
    return null
  }
}

// Live bulk fetch - the cold-cache fallback. Returns the raw Odds API events,
// or null when every league request failed (caller serves mock, same as the
// no-key path). Logged server-side so a real outage is still diagnosable.
async function fetchLiveEvents(apiKey) {
  const results = await Promise.allSettled(
    SPORTS.map(async (sport) => {
      const apiUrl = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${apiKey}&regions=${REGION}&markets=${MARKETS}&oddsFormat=decimal&includeLinks=true`
      const res = await fetch(apiUrl)
      if (!res.ok) throw new Error(`${sport}: ${res.status}`)
      return res.json()
    })
  )
  const events = results.filter((r) => r.status === 'fulfilled').flatMap((r) => r.value)
  if (!events.length && results.every((r) => r.status === 'rejected')) {
    console.error('Odds provider error, falling back to mock:', results[0].reason?.message)
    return null
  }
  return events
}

// Resolve the base fixture list from the best available source. Returns
// { fixtures, source } (source feeds the x-data-source header), or null to
// signal "serve mock". Priority: durable DB cache -> in-memory live cache ->
// live fetch.
async function resolveFixtures(apiKey) {
  const dbList = await readCachedList()
  if (dbList) return { fixtures: dbList, source: 'db' }

  const memList = cacheGet(CACHE_KEY)
  if (memList) return { fixtures: memList, source: 'live-cached' }

  if (!apiKey) return null
  const events = await fetchLiveEvents(apiKey)
  if (!events) return null
  const fixtures = events.map(reshapeEvent).sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff))
  cacheSet(CACHE_KEY, fixtures, LIST_TTL)
  return { fixtures, source: 'live' }
}

async function serveList(apiKey) {
  const base = await resolveFixtures(apiKey)
  if (!base) return serveMock(null)
  return json(base.fixtures, base.source)
}

async function serveFixture(id, apiKey) {
  const cachedFixture = cacheGet(`football-fixture-${id}`)
  if (cachedFixture) return json(cachedFixture, 'live-cached')

  const base = await resolveFixtures(apiKey)
  if (!base) return serveMock(id)

  const fixture = base.fixtures.find((f) => f.id === id)
  if (!fixture) return json(null, base.source)

  // Without a key we can't make the per-event enrichment calls - serve the
  // base fixture (h2h + totals) as-is rather than nothing.
  if (!apiKey) return json(fixture, base.source)

  const enriched = { ...fixture, markets: [...fixture.markets] }
  const sportKey = fixture.sportKey

  // Player props (goalscorer markets) aren't in the bulk endpoint - they need
  // a separate per-event call (one more credit), and critically The Odds API's
  // soccer player-prop coverage is US-bookmaker-only, so this must query
  // regions=us regardless of REGION above or it always comes back empty even
  // when the market exists. Bookmakers also don't post these until close to
  // kickoff, so empty is normal for fixtures still weeks out - never an error.
  try {
    const playerMarketKeys = ['player_goal_scorer_anytime', 'player_first_goal_scorer', 'player_last_goal_scorer']
    const playerUrl = `https://api.the-odds-api.com/v4/sports/${sportKey}/events/${id}/odds/?apiKey=${apiKey}&regions=us&markets=${playerMarketKeys.join(',')}&oddsFormat=decimal&includeLinks=true`
    const playerRes = await fetch(playerUrl)
    if (playerRes.ok) enriched.markets.push(...reshapePlayerMarkets(await playerRes.json()))
  } catch {
    // Nice-to-have - never fail the whole fixture load over player props.
  }

  // Additional UK-bookmaker markets (BTTS, draw no bet, double chance), same
  // one-call-per-fixture treatment as player props so the bulk list stays cheap.
  try {
    const extraMarketKeys = Object.keys(EXTRA_MARKET_LABELS)
    const extraUrl = `https://api.the-odds-api.com/v4/sports/${sportKey}/events/${id}/odds/?apiKey=${apiKey}&regions=${REGION}&markets=${extraMarketKeys.join(',')}&oddsFormat=decimal&includeLinks=true`
    const extraRes = await fetch(extraUrl)
    if (extraRes.ok) enriched.markets.push(...reshapeExtraMarkets(await extraRes.json()))
  } catch {
    // Nice-to-have - never fail the whole fixture load over extra markets.
  }

  cacheSet(`football-fixture-${id}`, enriched, DETAIL_TTL)
  return json(enriched, base.source)
}

export default async (req) => {
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  const apiKey = process.env.ODDS_API_KEY
  try {
    return id ? await serveFixture(id, apiKey) : await serveList(apiKey)
  } catch (err) {
    console.error('Odds provider error, falling back to mock:', err.message)
    return serveMock(id)
  }
}
