// Team crest lookup, proxied through netlify/functions/team-badge.js rather
// than hitting TheSportsDB straight from the browser - that direct call
// could be blocked by CORS and was rate-limited into initials-only badges
// on real devices (worst on mobile); see that function for the full why.
// Client-side in-memory cached per team name so the same club showing up
// across multiple fixture cards only triggers one request per page session.
// Never throws - callers get null on any failure and fall back to an
// initials badge (see src/components/TeamBadge.jsx).

const cache = new Map()

// `sport` (football/basketball/hockey/baseball/nfl/rugbyLeague/rugbyUnion/
// cricket) lets the server-side lookup reject a same-name match from the
// wrong sport instead of confidently showing the wrong crest - see
// netlify/functions/team-badge.js. Folded into the cache key since the same
// name can resolve differently per sport.
export async function getTeamBadge(teamName, sport) {
  const cacheKey = sport ? `${sport}:${teamName}` : teamName
  if (cache.has(cacheKey)) return cache.get(cacheKey)

  const query = sport ? `team=${encodeURIComponent(teamName)}&sport=${encodeURIComponent(sport)}` : `team=${encodeURIComponent(teamName)}`
  const promise = fetch(`/api/team-badge?${query}`)
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => data?.url ?? null)
    .catch(() => null)

  cache.set(cacheKey, promise)
  const badgeUrl = await promise
  cache.set(cacheKey, badgeUrl) // replace the in-flight promise with the resolved value
  return badgeUrl
}
