// Shared first step for both src/lib/playerPhotos.js (icon-sized lookups,
// used on nearly every outcome row) and src/lib/playerProfile.js (the
// fuller profile sheet) - both need TheSportsDB's searchplayers.php result
// for a name, so this dedupes that call and its cache instead of each
// module hitting the API separately for the same player.
const cache = new Map()

export async function findPlayer(playerName) {
  if (cache.has(playerName)) return cache.get(playerName)

  const promise = fetch(`https://www.thesportsdb.com/api/v1/json/3/searchplayers.php?p=${encodeURIComponent(playerName)}`)
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => data?.player?.[0] ?? null)
    .catch(() => null)

  cache.set(playerName, promise)
  const match = await promise
  cache.set(playerName, match)
  return match
}
