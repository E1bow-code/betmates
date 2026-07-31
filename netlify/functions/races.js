// Proxy between the frontend and whichever odds API we land on.
// Keeps the API key server-side (Netlify env var), never shipped to the client.
//
// Not wired to a real provider yet — see src/api/oddsClient.js (USE_MOCK flag).
// Once we pick a provider: fetch from it here using process.env.ODDS_API_KEY,
// reshape its response into the { id, course, raceName, offTime, ..., runners: [...] }
// shape used by src/data/mockOdds.js, and return that. UI code doesn't change.

import { getMockRaces, getMockRace } from '../../src/data/mockOdds.js'

export default async (req) => {
  const apiKey = process.env.ODDS_API_KEY

  if (!apiKey) {
    // No provider configured yet: serve mock data so the full request path
    // (frontend -> function -> response) can still be exercised end-to-end.
    const url = new URL(req.url)
    const id = url.searchParams.get('id')
    const body = id ? getMockRace(id) : getMockRaces()
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json', 'x-data-source': 'mock' }
    })
  }

  return new Response(JSON.stringify({ error: 'Odds provider not yet implemented' }), {
    status: 501,
    headers: { 'content-type': 'application/json' }
  })
}
