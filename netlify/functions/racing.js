// Proxy for horse racing odds/racecards. No provider is wired up yet - the
// brief's Section 3 notes we lost access to The Racing API that the prior
// project (horsehelper) used. Options to evaluate next: Betfair Exchange
// API (free tier, has racing markets), Racing Post/Timeform (paid,
// robust), or a RapidAPI racing-odds provider. Until one is picked, this
// always serves mock data - see src/api/racingClient.js (USE_MOCK flag).

export default async (req) => {
  const { getMockRaces, getMockRace } = await import('../../src/data/mockRacingOdds.js')
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  const body = id ? getMockRace(id) : getMockRaces()
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', 'x-data-source': 'mock' }
  })
}
