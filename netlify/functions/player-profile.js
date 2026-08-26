// Proxy to TheSportsDB for the fuller participant profile (bio, physical
// stats, socials) shown on ParticipantProfileSheet.jsx - the profile-side
// twin of player-photo.js/team-badge.js, and server-side for the same
// reason: TheSportsDB's JSON API isn't reliably CORS-enabled, so a browser
// fetch can be blocked outright rather than just slow. src/lib/
// playerProfile.js used to do this same two-step search+lookup straight
// from the browser (via sportsDbPlayerSearch.js, now deleted) - fine on
// some devices/networks, silently blank on others, exactly the failure
// mode player-photo.js was already built to avoid for the plainer photo
// lookup. Never throws - the client gets { profile: null } and the sheet
// renders around whatever fields are missing, same as before.
import { cacheGet, cacheSet } from '../../src/lib/apiCache.js'

const HIT_TTL = 7 * 24 * 60 * 60 * 1000
const MISS_TTL = 60 * 60 * 1000
// Same reasoning as player-photo.js's FAILURE_TTL: an outright fetch
// failure (rate limit, timeout, a flaky blip) says nothing about whether
// the player exists, so it shouldn't be cached as long as a genuine miss.
const FAILURE_TTL = 5 * 60 * 1000

// TheSportsDB's searchplayers.php loose-matches across every sport it
// covers, not just the caller's - see player-photo.js's own comment on
// this exact issue ("Jon Jones" the UFC fighter vs. a retired footballer
// of the same name). Only trust a result that's actually the sport asked
// for; no match beats a confidently-wrong one.
const SPORT_MAP = { football: 'Soccer', tennis: 'Tennis', boxing: 'Fighting', ufc: 'Fighting' }

function json(profile, source) {
  const headers = { 'content-type': 'application/json' }
  if (source) headers['x-data-source'] = source
  return new Response(JSON.stringify({ profile }), { status: 200, headers })
}

function normalizeSocialUrl(handle) {
  if (!handle) return null
  return handle.startsWith('http') ? handle : `https://${handle}`
}

function mapProfile(p) {
  return {
    photo: p.strRender || p.strCutout || p.strThumb || null,
    banner: p.strBanner || p.strFanart1 || null,
    nationality: p.strNationality || null,
    birthLocation: p.strBirthLocation || null,
    dateBorn: p.dateBorn || null,
    height: p.strHeight || null,
    weight: p.strWeight || null,
    status: p.strStatus || null,
    bio: p.strDescriptionEN || null,
    // Card-front fields (see ParticipantProfileSheet.jsx) - sport, team, and
    // position all come back on every lookup regardless of sport. For
    // combat sports strTeam is a weight class ("UFC Lightweight"), not a
    // real club, so it's still shown but never sent through TeamBadge.
    sport: p.strSport || null,
    team: p.strTeam || null,
    position: p.strPosition || null,
    number: p.strNumber || null,
    twitter: normalizeSocialUrl(p.strTwitter),
    instagram: normalizeSocialUrl(p.strInstagram),
    facebook: normalizeSocialUrl(p.strFacebook)
  }
}

export default async (req) => {
  const params = new URL(req.url).searchParams
  const name = params.get('name')
  if (!name) return json(null)
  const sport = params.get('sport')
  const wantedSport = SPORT_MAP[sport]

  const key = wantedSport ? `player-profile-${sport}-${name.toLowerCase()}` : `player-profile-${name.toLowerCase()}`
  const cached = cacheGet(key)
  if (cached !== undefined) return json(cached, 'live-cached')

  const apiKey = process.env.SPORTSDB_API_KEY || '3'
  try {
    const searchRes = await fetch(`https://www.thesportsdb.com/api/v1/json/${apiKey}/searchplayers.php?p=${encodeURIComponent(name)}`)
    if (!searchRes.ok) throw new Error(`TheSportsDB search: ${searchRes.status}`)
    const searchData = await searchRes.json()
    const match = wantedSport ? searchData?.player?.find((p) => p.strSport === wantedSport) : searchData?.player?.[0]
    if (!match?.idPlayer) {
      cacheSet(key, null, MISS_TTL)
      return json(null)
    }

    const lookupRes = await fetch(`https://www.thesportsdb.com/api/v1/json/${apiKey}/lookupplayer.php?id=${match.idPlayer}`)
    if (!lookupRes.ok) throw new Error(`TheSportsDB lookup: ${lookupRes.status}`)
    const lookupData = await lookupRes.json()
    const p = lookupData?.players?.[0]
    if (!p) {
      cacheSet(key, null, MISS_TTL)
      return json(null)
    }

    const profile = mapProfile(p)
    cacheSet(key, profile, HIT_TTL)
    return json(profile, 'live')
  } catch (err) {
    console.error(`player-profile lookup failed for "${name}":`, err.message)
    cacheSet(key, null, FAILURE_TTL)
    return json(null)
  }
}
