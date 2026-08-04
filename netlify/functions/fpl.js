// Proxy to the official Fantasy Premier League API - free, no key needed,
// but fantasy.premierleague.com doesn't send CORS headers permissive
// enough for a browser to call it directly, so this just forwards the two
// shapes the FPL segment (src/pages/SocialFeedPage.jsx) needs and reshapes
// them down to what the UI actually uses. Cached the same way the other
// proxies here are (see src/lib/apiCache.js) - standings/points only change
// once a gameweek's matches are final, not worth refetching every visit.
import { cacheGet, cacheSet } from '../../src/lib/apiCache.js'

const TTL = 15 * 60 * 1000
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; BetMates/1.0)' }

async function fetchEntry(entryId) {
  const cacheKey = `fpl-entry-${entryId}`
  const cached = cacheGet(cacheKey)
  if (cached) return cached

  const res = await fetch(`https://fantasy.premierleague.com/api/entry/${entryId}/`, { headers: HEADERS })
  if (!res.ok) throw new Error(`FPL entry ${entryId}: ${res.status}`)
  const body = await res.json()
  const result = {
    entryId,
    teamName: body.name,
    managerName: `${body.player_first_name} ${body.player_last_name}`,
    overallRank: body.summary_overall_rank,
    overallPoints: body.summary_overall_points,
    eventPoints: body.summary_event_points,
    currentEvent: body.current_event
  }
  cacheSet(cacheKey, result, TTL)
  return result
}

async function fetchLeague(leagueId) {
  const cacheKey = `fpl-league-${leagueId}`
  const cached = cacheGet(cacheKey)
  if (cached) return cached

  const res = await fetch(`https://fantasy.premierleague.com/api/leagues-classic/${leagueId}/standings/`, { headers: HEADERS })
  if (!res.ok) throw new Error(`FPL league ${leagueId}: ${res.status}`)
  const body = await res.json()
  const result = {
    leagueId,
    leagueName: body.league?.name ?? 'League',
    standings: (body.standings?.results ?? []).map((r) => ({
      entryId: r.entry,
      rank: r.rank,
      lastRank: r.last_rank,
      teamName: r.entry_name,
      managerName: r.player_name,
      eventPoints: r.event_total,
      totalPoints: r.total
    }))
  }
  cacheSet(cacheKey, result, TTL)
  return result
}

export default async (req) => {
  const url = new URL(req.url)
  const entryId = url.searchParams.get('entry')
  const leagueId = url.searchParams.get('league')

  if (!entryId && !leagueId) {
    return new Response(JSON.stringify({ error: 'Pass ?entry= or ?league=' }), { status: 400 })
  }

  try {
    const body = entryId ? await fetchEntry(entryId) : await fetchLeague(leagueId)
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
}
