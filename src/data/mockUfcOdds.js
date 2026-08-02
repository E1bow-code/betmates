// Mock UFC/MMA moneyline odds, same shape family as mockFootballOdds.js.
// See netlify/functions/ufc.js for the live path (The Odds API's
// mma_mixed_martial_arts sport, confirmed to carry real UFC fight odds).

import { BOOKMAKERS } from '../lib/bookmakers.js'

function makeOutcome(name, prices) {
  const allOdds = prices.map((decimal, i) => ({ bookmaker: BOOKMAKERS[i % BOOKMAKERS.length], decimal }))
  const bestOdds = allOdds.reduce((a, b) => (b.decimal > a.decimal ? b : a))
  return { name, team: null, allOdds: allOdds.sort((a, b) => b.decimal - a.decimal), bestOdds }
}

function inHours(h) {
  const d = new Date()
  d.setMinutes(0, 0, 0)
  d.setHours(d.getHours() + h)
  return d.toISOString()
}

function makeFight(id, fighterA, fighterB, hours, pricesA, pricesB) {
  return {
    id,
    competition: 'UFC',
    fighterA,
    fighterB,
    kickoff: inHours(hours),
    status: 'scheduled',
    markets: [
      {
        key: 'h2h',
        label: 'Moneyline',
        outcomes: [makeOutcome(fighterA, pricesA), makeOutcome(fighterB, pricesB)]
      }
    ]
  }
}

export const mockFights = [
  makeFight(
    'fight_makhachev_garry',
    'Islam Makhachev',
    'Ian Garry',
    30,
    [1.3, 1.28, 1.32, 1.3, 1.29, 1.31],
    [3.6, 3.75, 3.5, 3.6, 3.65, 3.6]
  ),
  makeFight(
    'fight_nurmagomedov_yadong',
    'Umar Nurmagomedov',
    'Song Yadong',
    120,
    [1.55, 1.5, 1.53, 1.57, 1.5, 1.55],
    [2.55, 2.65, 2.6, 2.5, 2.65, 2.55]
  ),
  makeFight(
    'fight_dern_robertson',
    'Mackenzie Dern',
    'Gillian Robertson',
    20,
    [1.65, 1.6, 1.62, 1.65, 1.6, 1.65],
    [2.3, 2.35, 2.3, 2.25, 2.35, 2.3]
  ),
  makeFight(
    'fight_gamrot_salkilld',
    'Mateusz Gamrot',
    'Quillan Salkilld',
    9,
    [1.22, 1.2, 1.25, 1.22, 1.2, 1.22],
    [4.3, 4.5, 4.1, 4.3, 4.5, 4.3]
  )
]

export function getMockFights() {
  return structuredClone(mockFights).sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff))
}

export function getMockFight(id) {
  const fight = mockFights.find((f) => f.id === id)
  return fight ? structuredClone(fight) : null
}
