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
  social: 'sports fans celebrating stadium',
  tracker: 'sports stadium scoreboard',
  account: 'sports equipment locker room',
  achievements: 'trophy celebration stadium',
  alerts: 'football referee whistle',
  group: 'football team huddle celebration',
  profile: 'athlete action shot stadium',
  insights: 'stadium scoreboard lights night'
}

export default async (req) => {
  const apiKey = process.env.PEXELS_API_KEY
  const url = new URL(req.url)
  const sport = url.searchParams.get('sport')
  const query = SPORT_QUERIES[sport]

  if (!apiKey || !query) {
    return new Response(JSON.stringify({ url: null }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  }

  const cached = cacheGet(`photo-${sport}`)
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
    if (photoUrl) cacheSet(`photo-${sport}`, photoUrl, PHOTO_TTL)
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
