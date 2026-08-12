// A UFC/boxing fighter's last 3 results, proxied through
// netlify/functions/fighter-history.js for the same CORS/rate-limit reasons
// as playerPhotos.js and teamBadges.js. Client-cached per name for the page
// session. Never throws - callers get [] on any failure and just don't
// render the section (see ParticipantProfileSheet.jsx).
const cache = new Map()

export async function getFighterHistory(fighterName) {
  if (cache.has(fighterName)) return cache.get(fighterName)

  const promise = fetch(`/api/fighter-history?name=${encodeURIComponent(fighterName)}`)
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => data?.fights ?? [])
    .catch(() => [])

  cache.set(fighterName, promise)
  const fights = await promise
  cache.set(fighterName, fights)
  return fights
}
