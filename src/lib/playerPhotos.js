// Player photo lookup, same approach as src/lib/teamBadges.js: proxied
// through netlify/functions/player-photo.js instead of hitting TheSportsDB
// straight from the browser (CORS + free-tier rate limits blanked headshots
// on real devices, worst on mobile). Client-side in-memory cached per name.

const cache = new Map()

export async function getPlayerPhoto(playerName) {
  if (cache.has(playerName)) return cache.get(playerName)

  const promise = fetch(`/api/player-photo?name=${encodeURIComponent(playerName)}`)
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => data?.url ?? null)
    .catch(() => null)

  cache.set(playerName, promise)
  const photoUrl = await promise
  cache.set(playerName, photoUrl)
  return photoUrl
}
