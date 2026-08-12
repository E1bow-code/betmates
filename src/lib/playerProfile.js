// Richer participant data for detail pages - same source and free test key
// as src/lib/playerPhotos.js, sharing its searchplayers.php step via
// sportsDbPlayerSearch.js rather than repeating that call. lookupplayer.php
// against the id that search turns up is the second call this adds - it
// returns a bio, physical stats, and social profile links that
// searchplayers.php doesn't. Coverage is uneven (a UFC champion has a full
// bio and socials, a lower-card fighter often only has the basics) - every
// field on the returned object can be null, callers render around whatever's
// actually there.
import { findPlayer } from './sportsDbPlayerSearch.js'

const cache = new Map()

export async function getPlayerProfile(playerName, sport) {
  const cacheKey = sport ? `${sport}:${playerName}` : playerName
  if (cache.has(cacheKey)) return cache.get(cacheKey)

  const promise = fetchProfile(playerName, sport).catch(() => null)
  cache.set(cacheKey, promise)
  const profile = await promise
  cache.set(cacheKey, profile)
  return profile
}

async function fetchProfile(playerName, sport) {
  const match = await findPlayer(playerName, sport)
  if (!match?.idPlayer) return null

  const lookupRes = await fetch(`https://www.thesportsdb.com/api/v1/json/3/lookupplayer.php?id=${match.idPlayer}`)
  if (!lookupRes.ok) return null
  const lookupData = await lookupRes.json()
  const p = lookupData?.players?.[0]
  if (!p) return null

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

function normalizeSocialUrl(handle) {
  if (!handle) return null
  return handle.startsWith('http') ? handle : `https://${handle}`
}
