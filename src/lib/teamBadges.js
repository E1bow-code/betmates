// Team crest lookup via TheSportsDB's free public API (test key "3", no
// registration needed - see https://www.thesportsdb.com/free_sports_api).
// Client-side only, in-memory cached per team name so the same club
// showing up across multiple fixture cards only triggers one network call
// per page session. Never throws - callers get null on any failure and
// fall back to an initials badge (see src/components/TeamBadge.jsx).

const cache = new Map()

export async function getTeamBadge(teamName) {
  if (cache.has(teamName)) return cache.get(teamName)

  const promise = fetch(`https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(teamName)}`)
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => data?.teams?.[0]?.strBadge ?? null)
    .catch(() => null)

  cache.set(teamName, promise)
  const badgeUrl = await promise
  cache.set(teamName, badgeUrl) // replace the in-flight promise with the resolved value
  return badgeUrl
}
