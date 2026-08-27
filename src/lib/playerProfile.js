// Richer participant data for detail pages - same approach as
// src/lib/playerPhotos.js: proxied through netlify/functions/player-
// profile.js instead of hitting TheSportsDB straight from the browser
// (CORS + free-tier rate limits blanked bios/photos on real devices, worst
// on mobile - the exact failure player-photo.js was already built to avoid
// for the plainer photo lookup, and this one used to still have). Coverage
// is uneven (a UFC champion has a full bio and socials, a lower-card
// fighter often only has the basics) - every field on the returned object
// can be null, callers render around whatever's actually there.

const cache = new Map()

export async function getPlayerProfile(playerName, sport) {
  const cacheKey = sport ? `${sport}:${playerName}` : playerName
  if (cache.has(cacheKey)) return cache.get(cacheKey)

  const query = sport ? `name=${encodeURIComponent(playerName)}&sport=${encodeURIComponent(sport)}` : `name=${encodeURIComponent(playerName)}`
  const promise = fetch(`/api/player-profile?${query}`)
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => data?.profile ?? null)
    .catch(() => null)

  cache.set(cacheKey, promise)
  const profile = await promise
  cache.set(cacheKey, profile)
  return profile
}
