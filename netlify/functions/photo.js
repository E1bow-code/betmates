// Proxy to the Pexels API (free-license stock photography, no attribution
// required) for the atmospheric background banner on the Odds pages - see
// src/components/SportHeroBanner.jsx. Keeps PEXELS_API_KEY server-side and
// picks the SAME photo per sport for a day at a time (cached, see
// src/lib/apiCache.js) rather than a fresh random one per request: it's
// decoration, not data, so stability beats freshness here, and it keeps
// well within Pexels' free tier (200 req/hour, 20,000/month).
import { cacheGet, cacheSet } from '../../src/lib/apiCache.js'

const PHOTO_TTL = 24 * 60 * 60 * 1000

const SPORT_QUERIES = {
  football: 'soccer stadium crowd night',
  racing: 'horse racing track',
  ufc: 'mma octagon fighting',
  tennis: 'tennis court stadium',
  basketball: 'basketball arena night',
  hockey: 'ice hockey rink',
  baseball: 'baseball stadium night',
  nfl: 'american football stadium',
  rugbyLeague: 'rugby league match',
  rugbyUnion: 'rugby union match',
  cricket: 'cricket stadium match',
  boxing: 'boxing ring gloves',
  // Page-level banners (not tied to a specific sport) - same treatment,
  // just a different query per page instead of per sport. All of these
  // are deliberately action/equipment/stadium shots rather than generic
  // lifestyle photography, so every banner in the app reads as sport at
  // a glance, not just the ones on a sport-specific tab.
  auth: 'stadium floodlights night',
  // NB: `dashboard` is handled specially (see resolveQuery) so the home
  // banner rotates daily rather than showing the same photo every day.
  social: 'sports fans celebrating stadium',
  tracker: 'digital scoreboard close up sports',
  account: 'sports jersey number close up',
  achievements: 'championship trophy display',
  alerts: 'stopwatch timer close up sports',
  group: 'sports bar crowd cheering',
  profile: 'gold medal close up athlete',
  insights: 'stadium scoreboard lights night',
  friends: 'friends high five celebrating sports',
  explore: 'stadium wide angle overview crowd'
}

// The home banner rotates through a different sport each day rather than
// always showing the same photo - so the front door feels current, and over a
// couple of weeks a user sees the whole spread of what the app covers. Keyed
// off the calendar day so it's stable within a day (and the cache key carries
// the date so a new day fetches a fresh one).
const DASHBOARD_ROTATION = [
  'football stadium crowd night',
  'basketball arena game action',
  'horse racing finish line',
  'tennis grand slam court',
  'boxing ring spotlight',
  'cricket stadium floodlights',
  'american football stadium night',
  'ice hockey arena game',
  'rugby match stadium',
  'baseball stadium evening',
  'formula one racing track',
  'golf tournament course',
  'marathon runners city street',
  'sports stadium aerial sunset'
]

// Resolves the Pexels query + a cache key for a given banner slot. Everything
// is a fixed per-sport query except `dashboard`, which rotates by date.
function resolveQuery(sport) {
  if (sport === 'dashboard') {
    const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD (UTC)
    const dayNumber = Math.floor(Date.parse(today) / 86400000)
    return { query: DASHBOARD_ROTATION[dayNumber % DASHBOARD_ROTATION.length], cacheKey: `photo-dashboard-${today}` }
  }
  return { query: SPORT_QUERIES[sport], cacheKey: `photo-${sport}` }
}

export default async (req) => {
  const apiKey = process.env.PEXELS_API_KEY
  const url = new URL(req.url)
  const sport = url.searchParams.get('sport')
  const { query, cacheKey } = resolveQuery(sport)

  if (!apiKey || !query) {
    return new Response(JSON.stringify({ url: null }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  }

  const cached = cacheGet(cacheKey)
  if (cached) {
    return new Response(JSON.stringify({ url: cached }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'x-data-source': 'live-cached' }
    })
  }

  try {
    const res = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`, {
      headers: { Authorization: apiKey }
    })
    if (!res.ok) throw new Error(`Pexels: ${res.status}`)
    const body = await res.json()
    const photoUrl = body.photos?.[0]?.src?.large2x ?? null
    if (photoUrl) cacheSet(cacheKey, photoUrl, PHOTO_TTL)
    return new Response(JSON.stringify({ url: photoUrl }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'x-data-source': 'live' }
    })
  } catch (err) {
    console.error('Pexels error, no banner this time:', err.message)
    return new Response(JSON.stringify({ url: null }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  }
}
