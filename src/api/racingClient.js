// Same swappable-adapter shape as src/api/oddsClient.js. Live data comes
// from The Racing API via netlify/functions/racing.js; that function itself
// falls back to mock if RACING_API_USERNAME/PASSWORD aren't set, so this
// stays off mock even in a dev environment without those env vars.

import { getMockRaces, getMockRace } from '../data/mockRacingOdds.js'

const USE_MOCK = false

export async function fetchRaces() {
  if (USE_MOCK) return getMockRaces()
  const res = await fetch('/api/racing')
  if (!res.ok) throw new Error(`Failed to load races: ${res.status}`)
  return res.json()
}

export async function fetchRace(id) {
  if (USE_MOCK) return getMockRace(id)
  const res = await fetch(`/api/racing?id=${encodeURIComponent(id)}`)
  if (!res.ok) throw new Error(`Failed to load race: ${res.status}`)
  return res.json()
}
