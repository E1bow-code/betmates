// A UFC fighter's reach, stance, weight class, and win/loss-by-method
// record - fields TheSportsDB's generic athlete lookup (playerProfile.js)
// doesn't carry, sourced separately from ESPN via
// netlify/functions/fighter-tale-of-tape.js. Client-cached per name for the
// page session, same shape as getFighterHistory. Never throws - callers get
// null on any failure and just don't render the section.
const cache = new Map()

export async function getFighterTaleOfTape(fighterName) {
  if (cache.has(fighterName)) return cache.get(fighterName)

  const promise = fetch(`/api/fighter-tale-of-tape?name=${encodeURIComponent(fighterName)}`)
    .then((res) => (res.ok ? res.json() : null))
    .catch(() => null)

  cache.set(fighterName, promise)
  const result = await promise
  cache.set(fighterName, result)
  return result
}
