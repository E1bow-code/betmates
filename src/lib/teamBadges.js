// Team crest lookup, proxied through netlify/functions/team-badge.js rather
// than hitting TheSportsDB straight from the browser - that direct call
// could be blocked by CORS and was rate-limited into initials-only badges
// on real devices (worst on mobile); see that function for the full why.
// Client-side in-memory cached per team name so the same club showing up
// across multiple fixture cards only triggers one request per page session.
// Never throws - callers get null on any failure and fall back to an
// initials badge (see src/components/TeamBadge.jsx).

const cache = new Map() // cacheKey -> resolved url|null, or an in-flight Promise

// A full Odds list render mounts a TeamBadge per team shown (~40-50 on a
// busy day), each firing its own getTeamBadge call in the same React commit.
// Rather than one /api/team-badge round trip per team, every call made
// before the next microtask tick is coalesced into a single POST to
// netlify/functions/team-badges.js (the batch counterpart) - every lookup
// was already server-cached for a week (apiCache.js) so this was never an
// upstream-API-quota problem, just a lot of simultaneous small requests for
// one page render.
let pending = null // Map<cacheKey, {team, sport}>
let pendingResolvers = null // Map<cacheKey, Array<(url: string|null) => void>>
let flushScheduled = false

function scheduleFlush() {
  if (flushScheduled) return
  flushScheduled = true
  queueMicrotask(flush)
}

async function flush() {
  flushScheduled = false
  const teams = pending
  const resolvers = pendingResolvers
  pending = null
  pendingResolvers = null

  let badges = {}
  try {
    const res = await fetch('/api/team-badges', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ teams: Array.from(teams.values()) })
    })
    if (res.ok) ({ badges } = await res.json())
  } catch {
    // badges stays {} - every pending call below resolves to null, same
    // fallback the old per-request .catch(() => null) gave.
  }

  for (const [key, callbacks] of resolvers) {
    const url = badges[key] ?? null
    callbacks.forEach((resolve) => resolve(url))
  }
}

// `sport` (football/basketball/hockey/baseball/nfl/rugbyLeague/rugbyUnion/
// cricket) lets the server-side lookup reject a same-name match from the
// wrong sport instead of confidently showing the wrong crest - see
// netlify/functions/team-badge.js. Folded into the cache key since the same
// name can resolve differently per sport.
export async function getTeamBadge(teamName, sport) {
  const cacheKey = sport ? `${sport}:${teamName}` : teamName
  if (cache.has(cacheKey)) return cache.get(cacheKey)

  if (!pending) {
    pending = new Map()
    pendingResolvers = new Map()
  }
  pending.set(cacheKey, { team: teamName, sport })
  if (!pendingResolvers.has(cacheKey)) pendingResolvers.set(cacheKey, [])

  const promise = new Promise((resolve) => {
    pendingResolvers.get(cacheKey).push(resolve)
  }).then((url) => {
    cache.set(cacheKey, url) // replace the in-flight promise with the resolved value
    return url
  })

  // Cached as a promise while in flight so a second call for the same team
  // - whether in this same batch or a slightly later one still awaiting
  // the same outstanding request - awaits this instead of starting another.
  cache.set(cacheKey, promise)
  scheduleFlush()
  return promise
}
