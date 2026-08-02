// Player photo lookup, same approach as src/lib/teamBadges.js: TheSportsDB's
// free public API (test key "3"), client-side, in-memory cached per name.

const cache = new Map()

export async function getPlayerPhoto(playerName) {
  if (cache.has(playerName)) return cache.get(playerName)

  const promise = fetch(`https://www.thesportsdb.com/api/v1/json/3/searchplayers.php?p=${encodeURIComponent(playerName)}`)
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => data?.player?.[0]?.strThumb ?? data?.player?.[0]?.strCutout ?? null)
    .catch(() => null)

  cache.set(playerName, promise)
  const photoUrl = await promise
  cache.set(playerName, photoUrl)
  return photoUrl
}
