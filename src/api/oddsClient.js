// Single seam between the UI and the odds data source. Today this reads
// from local mock data. Once ODDS_API_KEY is set in Netlify env vars, the
// function at netlify/functions/odds.js switches to The Odds API - no UI
// code needs to change, only USE_MOCK below.

import { getMockFixtures, getMockFixture } from '../data/mockFootballOdds.js'

const USE_MOCK = false

export async function fetchFixtures() {
  if (USE_MOCK) return getMockFixtures()
  const res = await fetch('/api/odds')
  if (!res.ok) throw new Error(`Failed to load fixtures: ${res.status}`)
  return res.json()
}

export async function fetchFixture(id) {
  if (USE_MOCK) return getMockFixture(id)
  const res = await fetch(`/api/odds?id=${encodeURIComponent(id)}`)
  if (!res.ok) throw new Error(`Failed to load fixture: ${res.status}`)
  return res.json()
}
