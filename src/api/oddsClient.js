// Single seam between the UI and the odds data source.
// Today this reads from local mock data. Once we pick a real odds API,
// swap the bodies of these two functions to `fetch('/api/races')` /
// `fetch('/api/races/' + id)`, which hit the Netlify Function proxy in
// netlify/functions/odds.js — no UI code needs to change.

import { getMockRaces, getMockRace } from '../data/mockOdds.js'

const USE_MOCK = true

export async function fetchRaces() {
  if (USE_MOCK) return getMockRaces()
  const res = await fetch('/api/races')
  if (!res.ok) throw new Error(`Failed to load races: ${res.status}`)
  return res.json()
}

export async function fetchRace(id) {
  if (USE_MOCK) return getMockRace(id)
  const res = await fetch(`/api/races?id=${encodeURIComponent(id)}`)
  if (!res.ok) throw new Error(`Failed to load race: ${res.status}`)
  return res.json()
}
