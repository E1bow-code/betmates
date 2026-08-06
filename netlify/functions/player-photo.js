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

function json(url, source) {
  const headers = { 'content-type': 'application/json' }
  if (source) headers['x-data-source'] = source
  return new Response(JSON.stringify({ url }), { status: 200, headers })
}

export default async (req) => {
  const name = new URL(req.url).searchParams.get('name')
  if (!name) return json(null)

  const key = `player-${name.toLowerCase()}`
  const cached = cacheGet(key)
  if (cached !== undefined) return json(cached, 'live-cached')

  const apiKey = process.env.SPORTSDB_API_KEY || '3'
  try {
    const res = await fetch(`https://www.thesportsdb.com/api/v1/json/${apiKey}/searchplayers.php?p=${encodeURIComponent(name)}`)
    if (!res.ok) throw new Error(`TheSportsDB: ${res.status}`)
    const data = await res.json()
    const player = data?.player?.[0]
    const photo = player?.strThumb ?? player?.strCutout ?? null
    cacheSet(key, photo, photo ? HIT_TTL : MISS_TTL)
    return json(photo, 'live')
  } catch (err) {
    console.error(`player-photo lookup failed for "${name}":`, err.message)
    cacheSet(key, null, MISS_TTL)
    return json(null)
  }
}
