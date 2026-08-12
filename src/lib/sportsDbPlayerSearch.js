// Shared first step for both src/lib/playerPhotos.js (icon-sized lookups,
// used on nearly every outcome row) and src/lib/playerProfile.js (the
// fuller profile sheet) - both need TheSportsDB's searchplayers.php result
// for a name, so this dedupes that call and its cache instead of each
// module hitting the API separately for the same player.
const cache = new Map()

// TheSportsDB's search is a loose match across every sport it covers, not
// just the caller's - "Jon Jones" (the UFC fighter) has no exact record and
// fuzzy-matches "Kenwyne Jones", a retired footballer, as the top result.
// Same mismatch class as netlify/functions/player-photo.js, fixed the same
// way: when the caller knows its sport, only trust a result that's
// actually that sport - a wrong photo/bio is worse than none at all.
const SPORT_MAP = { football: 'Soccer', tennis: 'Tennis', boxing: 'Fighting', ufc: 'Fighting' }

export async function findPlayer(playerName, sport) {
  const wantedSport = SPORT_MAP[sport]
  const cacheKey = wantedSport ? `${sport}:${playerName}` : playerName
  if (cache.has(cacheKey)) return cache.get(cacheKey)

  const promise = fetch(`https://www.thesportsdb.com/api/v1/json/3/searchplayers.php?p=${encodeURIComponent(playerName)}`)
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => (wantedSport ? (data?.player?.find((p) => p.strSport === wantedSport) ?? null) : (data?.player?.[0] ?? null)))
    .catch(() => null)

  cache.set(cacheKey, promise)
  const match = await promise
  cache.set(cacheKey, match)
  return match
}
