// Team crest lookup, proxied through netlify/functions/team-badge.js rather
// than hitting TheSportsDB straight from the browser - that direct call
// could be blocked by CORS and was rate-limited into initials-only badges
// on real devices (worst on mobile); see that function for the full why.
// Client-side in-memory cached per team name so the same club showing up
// across multiple fixture cards only triggers one request per page session.
// Never throws - callers get null on any failure and fall back to an
// initials badge (see src/components/TeamBadge.jsx).

const cache = new Map()

export async function getTeamBadge(teamName) {
  if (cache.has(teamName)) return cache.get(teamName)

  const promise = fetch(`/api/team-badge?team=${encodeURIComponent(teamName)}`)
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => data?.url ?? null)
    .catch(() => null)

  cache.set(teamName, promise)
  const badgeUrl = await promise
  cache.set(teamName, badgeUrl) // replace the in-flight promise with the resolved value
  return badgeUrl
}
