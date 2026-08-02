// Proxy to The Odds API's /scores endpoint, used by src/lib/settlement.js to
// auto-settle bets (see TrackerPage) instead of the user having to manually
// mark every bet won/lost. `keys` is a comma list of API sport keys the
// client already knows it needs (derived from open bets' legs) so this
// never fetches more than necessary. daysFrom=3 is the free-tier max
// lookback - a bet on a game older than that still needs manual settling.
export default async (req) => {
  const apiKey = process.env.ODDS_API_KEY
  const url = new URL(req.url)
  const keys = (url.searchParams.get('keys') ?? '').split(',').filter(Boolean)

  if (!apiKey || !keys.length) {
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'content-type': 'application/json', 'x-data-source': apiKey ? 'live' : 'mock' }
    })
  }

  try {
    const results = await Promise.allSettled(
      keys.map(async (sportKey) => {
        const apiUrl = `https://api.the-odds-api.com/v4/sports/${sportKey}/scores/?apiKey=${apiKey}&daysFrom=3`
        const res = await fetch(apiUrl)
        if (!res.ok) throw new Error(`${sportKey}: ${res.status}`)
        return res.json()
      })
    )

    const events = results.filter((r) => r.status === 'fulfilled').flatMap((r) => r.value)
    const games = events
      .filter((e) => e.completed && e.scores)
      .map((e) => ({
        homeTeam: e.home_team,
        awayTeam: e.away_team,
        scores: e.scores.map((s) => ({ name: s.name, score: Number(s.score) }))
      }))

    return new Response(JSON.stringify(games), {
      status: 200,
      headers: { 'content-type': 'application/json', 'x-data-source': 'live' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    })
  }
}
