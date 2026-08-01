// Same swappable-adapter shape as src/api/oddsClient.js. Mock-only today -
// no racing data source is wired up (the brief's Section 3 notes Racing
// API access was lost; Betfair Exchange, Racing Post/Timeform, or a
// RapidAPI provider are the options to evaluate before flipping USE_MOCK).

import { getMockRaces, getMockRace } from '../data/mockRacingOdds.js'

const USE_MOCK = true

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
