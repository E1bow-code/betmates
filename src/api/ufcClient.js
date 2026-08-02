// Same swappable-adapter shape as src/api/oddsClient.js and racingClient.js.

import { getMockFights, getMockFight } from '../data/mockUfcOdds.js'

const USE_MOCK = false

export async function fetchFights() {
  if (USE_MOCK) return getMockFights()
  const res = await fetch('/api/ufc')
  if (!res.ok) throw new Error(`Failed to load fights: ${res.status}`)
  return res.json()
}

export async function fetchFight(id) {
  if (USE_MOCK) return getMockFight(id)
  const res = await fetch(`/api/ufc?id=${encodeURIComponent(id)}`)
  if (!res.ok) throw new Error(`Failed to load fight: ${res.status}`)
  return res.json()
}
