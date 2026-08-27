// Batch counterpart to team-badge.js - the Odds list mounts a TeamBadge per
// team shown (~40-50 on a busy day), and each one used to fire its own
// /api/team-badge round trip on mount. Every lookup was already server-side
// cached (see apiCache.js) so this was never an upstream-API-quota problem,
// just a lot of simultaneous small requests for one page render. This lets
// src/lib/teamBadges.js coalesce everything requested in the same tick into
// one POST instead, reusing team-badge.js's exact cache/alias/sport-matching
// logic via resolveTeamBadge rather than a second copy of it.
import { resolveTeamBadge } from './team-badge.js'

// Defensive cap, not a real-world limit - a single Odds page render is
// nowhere near this many distinct teams.
const MAX_TEAMS = 200

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ badges: {} }), { status: 405, headers: { 'content-type': 'application/json' } })
  }

  let teams
  try {
    ;({ teams } = await req.json())
  } catch {
    teams = null
  }
  if (!Array.isArray(teams)) {
    return new Response(JSON.stringify({ badges: {} }), { status: 400, headers: { 'content-type': 'application/json' } })
  }

  // Dedupe by the same key format src/lib/teamBadges.js uses client-side, so
  // a repeated (team, sport) pair in one batch only triggers one lookup.
  const unique = new Map()
  for (const entry of teams.slice(0, MAX_TEAMS)) {
    const team = entry?.team
    if (!team) continue
    const sport = entry?.sport || undefined
    const key = sport ? `${sport}:${team}` : team
    if (!unique.has(key)) unique.set(key, { team, sport })
  }

  const results = await Promise.all(
    Array.from(unique.entries()).map(async ([key, { team, sport }]) => {
      const { badge } = await resolveTeamBadge(team, sport)
      return [key, badge]
    })
  )

  return new Response(JSON.stringify({ badges: Object.fromEntries(results) }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  })
}
