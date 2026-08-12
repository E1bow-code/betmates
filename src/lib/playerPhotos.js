// Player photo lookup, same approach as src/lib/teamBadges.js: proxied
// through netlify/functions/player-photo.js instead of hitting TheSportsDB
// straight from the browser (CORS + free-tier rate limits blanked headshots
// on real devices, worst on mobile). Client-side in-memory cached per name.

const cache = new Map()

// `sport` (football/tennis/boxing/ufc) lets the server-side lookup reject a
// same-name match from the wrong sport instead of confidently showing the
// wrong person - see netlify/functions/player-photo.js. Folded into the
// cache key since the same name can resolve differently per sport.
export async function getPlayerPhoto(playerName, sport) {
  const cacheKey = sport ? `${sport}:${playerName}` : playerName
  if (cache.has(cacheKey)) return cache.get(cacheKey)

  const query = sport ? `name=${encodeURIComponent(playerName)}&sport=${encodeURIComponent(sport)}` : `name=${encodeURIComponent(playerName)}`
  const promise = fetch(`/api/player-photo?${query}`)
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => data?.url ?? null)
    .catch(() => null)

  cache.set(cacheKey, promise)
  const photoUrl = await promise
  cache.set(cacheKey, photoUrl)
  return photoUrl
}
