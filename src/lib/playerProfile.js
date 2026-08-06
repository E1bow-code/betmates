// Richer participant data for detail pages - same source and free test key
// as src/lib/playerPhotos.js, but a second call: searchplayers.php only
// returns a thumbnail and a few fields, lookupplayer.php?id= against that
// player's id returns a bio, physical stats, and social profile links too.
// Coverage is uneven (a UFC champion has a full bio and socials, a lower-
// card fighter often only has the basics) - every field on the returned
// object can be null, callers render around whatever's actually there.
const cache = new Map()

export async function getPlayerProfile(playerName) {
  if (cache.has(playerName)) return cache.get(playerName)

  const promise = fetchProfile(playerName).catch(() => null)
  cache.set(playerName, promise)
  const profile = await promise
  cache.set(playerName, profile)
  return profile
}

async function fetchProfile(playerName) {
  const searchRes = await fetch(`https://www.thesportsdb.com/api/v1/json/3/searchplayers.php?p=${encodeURIComponent(playerName)}`)
  if (!searchRes.ok) return null
  const searchData = await searchRes.json()
  const match = searchData?.player?.[0]
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
    twitter: normalizeSocialUrl(p.strTwitter),
    instagram: normalizeSocialUrl(p.strInstagram),
    facebook: normalizeSocialUrl(p.strFacebook)
  }
}

function normalizeSocialUrl(handle) {
  if (!handle) return null
  return handle.startsWith('http') ? handle : `https://${handle}`
}
