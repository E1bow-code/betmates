// Proxy for UFC/MMA odds via The Odds API's `mma_mixed_martial_arts` sport
// (there's no UFC-specific key - this covers all MMA promotions, but in
// practice the UK-bookmaker-covered events are predominantly UFC cards).
//
// Read-through, same shape as netlify/functions/odds.js:
//   1. odds_cache (Supabase) - the durable list written by
//      netlify/functions/ufc-ingest.js. Once the cron has run, every user's
//      request is served from our own database at zero Odds API credits.
//   2. The Odds API live - only on a cold/stale cache.
//   3. Sample fights (src/data/mockUfcOdds.js) - no key, or a provider outage.
// Simpler than odds.js: a UFC card only has the moneyline market, so there's
// no per-fixture enrichment - a fixture request is just a lookup in the list.
import { createClient } from '@supabase/supabase-js'
import { cacheGet, cacheSet } from '../../src/lib/apiCache.js'
import { UFC_SPORT_KEY } from '../../src/lib/sportsConfig.js'
import { reshapeEvent } from '../../src/lib/ufcOddsShape.js'
import { logProviderError } from '../../src/lib/logProviderError.js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
const CACHE_KEY = 'ufc-list'

const SPORT = UFC_SPORT_KEY
const REGION = 'uk'
const MARKETS = 'h2h'
const LIST_TTL = 20 * 60 * 1000
// How stale a cron-written row may be before the proxy ignores it and goes
// live - see netlify/functions/odds.js's DB_MAX_AGE.
const DB_MAX_AGE = 12 * 60 * 60 * 1000
// The Odds API's MMA feed carries a long tail of speculative/rumoured
// far-future "cards" - fighters listed against opponents they were never
// actually booked with, sometimes the same fighter appearing in two
// different fixtures on the same day. Real UFC events are only ever
// confirmed something like 6-10 weeks out, so anything further than this
// is noise rather than a genuine near-term card - confirmed live, this
// cut real garbage (duplicate/impossible pairings months out) without
// touching the normal near-term list.
const MAX_DAYS_AHEAD = 60

function json(body, source) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', 'x-data-source': source }
  })
}

// Drop the speculative far-future cards (see MAX_DAYS_AHEAD). Applied at serve
// time to whatever source the list came from - DB cache, in-memory cache, or a
// live fetch - so the same near-term window is served no matter where the data
// originated (the durable cache never surfaces months-out garbage even if a
// cron happened to store it).
function withinWindow(fights) {
  const cutoff = Date.now() + MAX_DAYS_AHEAD * 24 * 60 * 60 * 1000
  return fights.filter((f) => new Date(f.kickoff).getTime() <= cutoff)
}

async function serveMock(id) {
  const { getMockFights, getMockFight } = await import('../../src/data/mockUfcOdds.js')
  const body = id ? getMockFight(id) : getMockFights()
  return json(body, 'mock')
}

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

// Best available fights list: durable DB cache -> in-memory live cache -> live
// fetch. Returns { fights, source } or null to signal "serve mock".
async function resolveFights(apiKey) {
  const dbList = await readCachedList()
  if (dbList) return { fights: dbList, source: 'db' }

  const memList = cacheGet(CACHE_KEY)
  if (memList) return { fights: memList, source: 'live-cached' }

  if (!apiKey) return null
  const apiUrl = `https://api.the-odds-api.com/v4/sports/${SPORT}/odds/?apiKey=${apiKey}&regions=${REGION}&markets=${MARKETS}&oddsFormat=decimal&includeLinks=true`
  const res = await fetch(apiUrl)
  if (!res.ok) {
    console.error(`Odds provider error (${res.status}), falling back to mock`)
    await logProviderError('odds-ufc', `HTTP ${res.status}`)
    return null
  }
  const events = await res.json()
  const fights = events.map(reshapeEvent).sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff))
  cacheSet(CACHE_KEY, fights, LIST_TTL)
  return { fights, source: 'live' }
}

export default async (req) => {
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  const apiKey = process.env.ODDS_API_KEY
  try {
    const base = await resolveFights(apiKey)
    if (!base) return serveMock(id)
    const fights = withinWindow(base.fights)
    const body = id ? fights.find((f) => f.id === id) ?? null : fights
    return json(body, base.source)
  } catch (err) {
    console.error('Odds provider error, falling back to mock:', err.message)
    await logProviderError('odds-ufc', err.message)
    return serveMock(id)
  }
}
