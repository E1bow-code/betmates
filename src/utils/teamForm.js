// Turns the recent completed games /api/scores returns into one team's form -
// the structured, name-matched view behind CoachGPT's get_team_form tool, so it
// can talk about "how's Arsenal doing" with concrete results instead of vibes.
// Pure: the netlify function fetches the games (the same /api/scores data
// get_recent_results already reads) and hands them in. Scope is inherently the
// last few days (the Odds API scores lookback), so this is "recent results",
// not a full season form guide - the tool tells the model to lean on web_search
// for deeper history.

// Normalise a team name for loose matching: lowercase, drop punctuation.
function norm(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Does this scoreboard name refer to the queried team? Substring either way
// ("arsenal" ⊂ "arsenal", "manchester united" ⊃ nothing shorter), or a shared
// distinctive word (>=4 chars) so "tottenham" still matches "Tottenham Hotspur"
// without matching every team on a short word like "the" or "utd".
export function teamNameMatches(name, query) {
  const n = norm(name)
  const q = norm(query)
  if (!n || !q) return false
  if (n.includes(q) || q.includes(n)) return true
  const words = new Set(n.split(' ').filter((w) => w.length >= 4))
  return q.split(' ').some((w) => w.length >= 4 && words.has(w))
}

function scoreOf(game, teamName) {
  const s = (game.scores ?? []).find((x) => x.name === teamName)
  // Guard null/empty explicitly - Number(null) is 0, which would score a
  // missing result as a phantom 0-0 rather than skipping the game.
  if (!s || s.score === null || s.score === undefined || s.score === '') return null
  const n = Number(s.score)
  return Number.isFinite(n) ? n : null
}

// games: [{ homeTeam, awayTeam, scores:[{name, score}] }] from /api/scores.
// Returns { available:false, reason } when nothing matched, otherwise a compact
// summary: W/D/L, goals for/against, and each result with opponent + venue.
export function summariseTeamForm(games, team) {
  const q = String(team ?? '').trim()
  if (!q) return { available: false, reason: 'no team given' }

  const results = []
  let won = 0
  let drawn = 0
  let lost = 0
  let goalsFor = 0
  let goalsAgainst = 0
  let resolvedName = null

  for (const g of Array.isArray(games) ? games : []) {
    const isHome = teamNameMatches(g.homeTeam, q)
    const isAway = teamNameMatches(g.awayTeam, q)
    if (isHome === isAway) continue // no match, or ambiguous both-sides - skip

    const teamName = isHome ? g.homeTeam : g.awayTeam
    const oppName = isHome ? g.awayTeam : g.homeTeam
    const forScore = scoreOf(g, teamName)
    const againstScore = scoreOf(g, oppName)
    if (!Number.isFinite(forScore) || !Number.isFinite(againstScore)) continue

    resolvedName = resolvedName ?? teamName
    goalsFor += forScore
    goalsAgainst += againstScore
    const outcome = forScore > againstScore ? 'W' : forScore < againstScore ? 'L' : 'D'
    if (outcome === 'W') won += 1
    else if (outcome === 'L') lost += 1
    else drawn += 1

    results.push({ opponent: oppName, venue: isHome ? 'home' : 'away', score: `${forScore}-${againstScore}`, outcome })
  }

  if (!results.length) {
    return { available: false, reason: `no recent completed games found for "${q}" in the last few days` }
  }

  return {
    available: true,
    team: resolvedName,
    played: results.length,
    won,
    drawn,
    lost,
    goalsFor,
    goalsAgainst,
    results,
    note: 'Recent results only (last few days). Use web_search for a fuller form guide or head-to-head history.'
  }
}
