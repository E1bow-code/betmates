// Realistic mock odds response, shaped like what The Odds API returns
// (markets -> outcomes -> per-bookmaker prices), so swapping in the real
// provider in netlify/functions/odds.js is a reshape, not a UI rewrite.
// See src/api/oddsClient.js (USE_MOCK flag).

import { BOOKMAKERS } from '../lib/bookmakers.js'

function makeOutcome(name, team, prices) {
  const allOdds = prices.map((decimal, i) => ({ bookmaker: BOOKMAKERS[i % BOOKMAKERS.length], decimal }))
  const bestOdds = allOdds.reduce((a, b) => (b.decimal > a.decimal ? b : a))
  return { name, team: team ?? null, allOdds: allOdds.sort((a, b) => b.decimal - a.decimal), bestOdds }
}

function inHours(h) {
  const d = new Date()
  d.setMinutes(0, 0, 0)
  d.setHours(d.getHours() + h)
  return d.toISOString()
}

function makeFixture(id, competition, home, away, hours, h2hPrices, totalsPrices) {
  return {
    id,
    competition,
    homeTeam: home,
    awayTeam: away,
    kickoff: inHours(hours),
    status: 'scheduled',
    markets: [
      {
        key: 'h2h',
        label: '1X2',
        outcomes: [
          makeOutcome('Home', home, h2hPrices.home),
          makeOutcome('Draw', null, h2hPrices.draw),
          makeOutcome('Away', away, h2hPrices.away)
        ]
      },
      {
        key: 'totals',
        label: 'Over/Under 2.5 Goals',
        outcomes: [makeOutcome('Over', null, totalsPrices.over), makeOutcome('Under', null, totalsPrices.under)]
      },
      {
        key: 'btts',
        label: 'Both Teams to Score',
        outcomes: [makeOutcome('Yes', null, totalsPrices.over.map((p) => p - 0.05)), makeOutcome('No', null, totalsPrices.under.map((p) => p + 0.1))]
      },
      {
        key: 'draw_no_bet',
        label: 'Draw No Bet',
        outcomes: [makeOutcome('Home', home, h2hPrices.home.map((p) => p * 0.8)), makeOutcome('Away', away, h2hPrices.away.map((p) => p * 0.8))]
      },
      {
        key: 'double_chance',
        label: 'Double Chance',
        outcomes: [
          makeOutcome(`${home}/Draw`, null, h2hPrices.home.map((p) => p * 0.55)),
          makeOutcome(`${home}/${away}`, null, [1.15, 1.14, 1.16, 1.15, 1.14, 1.15]),
          makeOutcome(`${away}/Draw`, null, h2hPrices.away.map((p) => p * 0.6))
        ]
      }
    ]
  }
}

export const mockFixtures = [
  makeFixture(
    'fix_ars_che',
    'Premier League',
    'Arsenal',
    'Chelsea',
    2,
    { home: [1.95, 2.0, 1.9, 2.05, 1.98, 2.0], draw: [3.6, 3.5, 3.7, 3.6, 3.5, 3.6], away: [3.9, 4.0, 3.8, 4.1, 3.9, 4.0] },
    { over: [1.85, 1.9, 1.87, 1.9, 1.88, 1.9], under: [1.95, 1.9, 1.93, 1.9, 1.92, 1.9] }
  ),
  makeFixture(
    'fix_liv_mci',
    'Premier League',
    'Liverpool',
    'Man City',
    3.5,
    { home: [2.5, 2.4, 2.55, 2.45, 2.5, 2.4], draw: [3.4, 3.5, 3.4, 3.5, 3.4, 3.5], away: [2.75, 2.7, 2.8, 2.7, 2.75, 2.7] },
    { over: [1.7, 1.72, 1.7, 1.75, 1.7, 1.72], under: [2.15, 2.1, 2.15, 2.05, 2.15, 2.1] }
  ),
  makeFixture(
    'fix_tot_mun',
    'Premier League',
    'Tottenham',
    'Man United',
    5,
    { home: [2.1, 2.15, 2.05, 2.1, 2.1, 2.15], draw: [3.5, 3.4, 3.5, 3.6, 3.5, 3.4], away: [3.5, 3.6, 3.5, 3.4, 3.5, 3.6] },
    { over: [1.95, 1.9, 1.92, 1.9, 1.95, 1.9], under: [1.85, 1.9, 1.88, 1.9, 1.85, 1.9] }
  ),
  makeFixture(
    'fix_new_avl',
    'Premier League',
    'Newcastle',
    'Aston Villa',
    7,
    { home: [1.8, 1.85, 1.8, 1.9, 1.83, 1.85], draw: [3.7, 3.6, 3.75, 3.6, 3.7, 3.6], away: [4.3, 4.5, 4.2, 4.4, 4.3, 4.4] },
    { over: [2.0, 1.95, 2.0, 1.9, 2.0, 1.95], under: [1.8, 1.85, 1.8, 1.9, 1.8, 1.85] }
  ),
  makeFixture(
    'fix_bou_bha',
    'Premier League',
    'Bournemouth',
    'Brighton',
    24,
    { home: [2.7, 2.6, 2.75, 2.65, 2.7, 2.6], draw: [3.3, 3.4, 3.3, 3.3, 3.3, 3.4], away: [2.6, 2.65, 2.55, 2.7, 2.6, 2.65] },
    { over: [1.9, 1.85, 1.9, 1.85, 1.9, 1.85], under: [1.9, 1.95, 1.9, 1.95, 1.9, 1.95] }
  ),
  makeFixture(
    'fix_rmd_bay',
    'Champions League',
    'Real Madrid',
    'Bayern Munich',
    28,
    { home: [2.2, 2.15, 2.25, 2.1, 2.2, 2.15], draw: [3.6, 3.7, 3.6, 3.75, 3.6, 3.7], away: [3.0, 3.1, 3.0, 3.2, 3.0, 3.1] },
    { over: [1.75, 1.7, 1.75, 1.7, 1.75, 1.7], under: [2.05, 2.1, 2.05, 2.1, 2.05, 2.1] }
  ),
  makeFixture(
    'fix_che_liv_facup',
    'FA Cup',
    'Chelsea',
    'Liverpool',
    48,
    { home: [2.9, 2.8, 2.9, 2.85, 2.9, 2.8], draw: [3.4, 3.5, 3.4, 3.5, 3.4, 3.5], away: [2.5, 2.55, 2.45, 2.6, 2.5, 2.55] },
    { over: [1.8, 1.85, 1.8, 1.85, 1.8, 1.85], under: [2.0, 1.95, 2.0, 1.95, 2.0, 1.95] }
  ),
  makeFixture(
    'fix_cel_ran',
    'Scottish Premiership',
    'Celtic',
    'Rangers',
    52,
    { home: [1.7, 1.75, 1.7, 1.8, 1.72, 1.75], draw: [3.9, 3.8, 3.9, 3.7, 3.9, 3.8], away: [4.8, 5.0, 4.6, 5.0, 4.8, 4.9] },
    { over: [1.65, 1.7, 1.65, 1.7, 1.65, 1.7], under: [2.2, 2.15, 2.2, 2.15, 2.2, 2.15] }
  )
]

export function getMockFixtures() {
  return structuredClone(mockFixtures).sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff))
}

export function getMockFixture(id) {
  const fixture = mockFixtures.find((f) => f.id === id)
  return fixture ? structuredClone(fixture) : null
}
