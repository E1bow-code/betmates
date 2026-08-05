// Client-facing proxy to The Racing API's /v1/results, used by
// src/lib/settlement.js to auto-settle racing bets the same way
// netlify/functions/scores.js lets it settle team-sport bets (see
// src/lib/betEvaluation.js for the shared won/lost/placed rules). Reshapes
// into [{ raceId, runners: [{ horseId, name, position }] }] - position is
// null for a non-finisher (fell, pulled up, etc.), which settlement treats
// the same as finishing outside the paid places.
import { cacheGet, cacheSet } from '../../src/lib/apiCache.js'

const RESULTS_TTL = 15 * 60 * 1000
const LOOKBACK_DAYS = 3
const PAGE_SIZE = 100
const MAX_PAGES = 5

function isoDate(d) {
  return d.toISOString().slice(0, 10)
}

// The API caps `limit` at 100 and a 3-day window regularly holds 150+
// races, so a single request doesn't cover it - page through with `skip`
// until `total` is satisfied (or MAX_PAGES, as a sane ceiling).
async function fetchAllResults(auth, startDate, endDate) {
  const all = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const skip = page * PAGE_SIZE
    const url = `https://api.theracingapi.com/v1/results?start_date=${startDate}&end_date=${endDate}&limit=${PAGE_SIZE}&skip=${skip}`
    const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } })
    if (!res.ok) throw new Error(`Racing results error: ${res.status}`)
    const { results, total } = await res.json()
    all.push(...(results ?? []))
    if (all.length >= total || !results?.length) break
  }
  return all
}

export default async (req) => {
  const username = process.env.RACING_API_USERNAME
  const password = process.env.RACING_API_PASSWORD
  if (!username || !password) {
    return new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } })
  }

  try {
    let races = cacheGet('racing-results')
    if (!races) {
      const end = new Date()
      const start = new Date(end.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
      const auth = Buffer.from(`${username}:${password}`).toString('base64')
      const results = await fetchAllResults(auth, isoDate(start), isoDate(end))
      races = results.map(reshapeResult)
      cacheSet('racing-results', races, RESULTS_TTL)
    }
    return new Response(JSON.stringify(races), {
      status: 200,
      headers: { 'content-type': 'application/json', 'x-data-source': 'live' }
    })
  } catch (err) {
    console.error('Racing results error:', err.message)
    return new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } })
  }
}

function reshapeResult(race) {
  return {
    raceId: race.race_id,
    runners: (race.runners ?? []).map((r) => ({
      horseId: r.horse_id,
      name: r.horse,
      position: Number.isFinite(Number(r.position)) ? Number(r.position) : null
    }))
  }
}
