// Proxy to TheSportsDB (https://www.thesportsdb.com/free_sports_api) for
// player/fighter headshots - the player-side twin of team-badge.js, and
// server-side for the same reasons: TheSportsDB's JSON API isn't reliably
// CORS-enabled, and the free tier rate-limits, which blanked headshots on
// real devices (worst on mobile) when src/lib/playerPhotos.js still fetched
// it straight from the browser. One shared cached lookup per name for the
// whole userbase (see apiCache.js) instead of one per client mount.
// Never throws - the client gets { url: null } and renders an initials
// avatar (src/components/PlayerPhoto.jsx).
import { cacheGet, cacheSet } from '../../src/lib/apiCache.js'

const HIT_TTL = 7 * 24 * 60 * 60 * 1000
const MISS_TTL = 60 * 60 * 1000
// A genuine "TheSportsDB has no such player" is stable - cache it for as
// long as a miss normally lasts. A fetch that outright failed (rate limit,
// timeout, a flaky mobile-triggered blip on the way to TheSportsDB) tells
// us nothing about whether the player exists, so caching it for the same
// hour was blanking real fighters until the TTL happened to expire on
// whichever warm instance took the request. Retry that case in minutes,
// not an hour.
const FAILURE_TTL = 5 * 60 * 1000

// TheSportsDB's searchplayers.php does loose name matching across every
// sport it covers, not just the one the caller actually wants - searching
// "Jon Jones" (the UFC fighter) turns up no exact record and instead
// fuzzy-matches "Kenwyne Jones", a retired footballer, as the top result.
// Blindly taking data.player[0] then shows a confidently-wrong photo
// (someone else entirely) rather than no photo, which is worse than a
// blank initials avatar. Callers that know their sport (every one in
// src/ does - see PlayerPhoto.jsx) pass it through so the result can be
// checked against TheSportsDB's own strSport field first.
const SPORT_MAP = { football: 'Soccer', tennis: 'Tennis', boxing: 'Fighting', ufc: 'Fighting' }

function json(url, source) {
  const headers = { 'content-type': 'application/json' }
  if (source) headers['x-data-source'] = source
  return new Response(JSON.stringify({ url }), { status: 200, headers })
}

export default async (req) => {
  const params = new URL(req.url).searchParams
  const name = params.get('name')
  if (!name) return json(null)
  const sport = params.get('sport')
  const wantedSport = SPORT_MAP[sport]

  const key = wantedSport ? `player-${sport}-${name.toLowerCase()}` : `player-${name.toLowerCase()}`
  const cached = cacheGet(key)
  if (cached !== undefined) return json(cached, 'live-cached')

  const apiKey = process.env.SPORTSDB_API_KEY || '3'
  try {
    const res = await fetch(`https://www.thesportsdb.com/api/v1/json/${apiKey}/searchplayers.php?p=${encodeURIComponent(name)}`)
    if (!res.ok) throw new Error(`TheSportsDB: ${res.status}`)
    const data = await res.json()
    // With a known sport, only trust a result that's actually that sport -
    // no match at all beats a confidently-wrong one. Without a sport (no
    // caller passes none today, kept for backwards compatibility) fall
    // back to the old first-result behaviour.
    const player = wantedSport ? data?.player?.find((p) => p.strSport === wantedSport) : data?.player?.[0]
    const photo = player?.strThumb ?? player?.strCutout ?? null
    cacheSet(key, photo, photo ? HIT_TTL : MISS_TTL)
    return json(photo, 'live')
  } catch (err) {
    console.error(`player-photo lookup failed for "${name}":`, err.message)
    cacheSet(key, null, FAILURE_TTL)
    return json(null)
  }
}
