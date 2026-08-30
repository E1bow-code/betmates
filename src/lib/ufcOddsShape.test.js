import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reshapeEvent } from './ufcOddsShape.js'

const bm = (title, outcomes) => ({ title, link: null, markets: [{ key: 'h2h', outcomes, link: null }] })

const fight = {
  id: 'f1',
  sport_title: 'UFC',
  home_team: 'Jon Jones',
  away_team: 'Stipe Miocic',
  commence_time: '2026-09-01T03:00:00Z',
  bookmakers: [
    bm('Sky Bet', [{ name: 'Jon Jones', price: 1.4 }, { name: 'Stipe Miocic', price: 3.0 }]),
    bm('Bet365', [{ name: 'Jon Jones', price: 1.45 }, { name: 'Stipe Miocic', price: 2.9 }])
  ]
}

test('reshapeEvent maps the fight to fighterA/fighterB with a Moneyline market', () => {
  const r = reshapeEvent(fight)
  assert.equal(r.id, 'f1')
  assert.equal(r.competition, 'UFC')
  assert.equal(r.fighterA, 'Jon Jones')
  assert.equal(r.fighterB, 'Stipe Miocic')
  assert.equal(r.kickoff, '2026-09-01T03:00:00Z')
  assert.equal(r.status, 'scheduled')
  assert.equal(r.markets.length, 1)
  assert.equal(r.markets[0].key, 'h2h')
  assert.equal(r.markets[0].label, 'Moneyline')
})

test('reshapeEvent merges books per fighter: allOdds sorted desc, bestOdds is the max', () => {
  const outcomes = reshapeEvent(fight).markets[0].outcomes
  const jones = outcomes.find((o) => o.name === 'Jon Jones')
  assert.deepEqual(jones.allOdds.map((o) => o.decimal), [1.45, 1.4])
  assert.equal(jones.bestOdds.decimal, 1.45)
  assert.equal(jones.bestOdds.bookmaker, 'Bet365')
  assert.equal(jones.team, null) // fights have no team
})

test('reshapeEvent yields no markets when nothing prices the fight', () => {
  assert.deepEqual(reshapeEvent({ ...fight, bookmakers: undefined }).markets, [])
  assert.deepEqual(reshapeEvent({ ...fight, bookmakers: [{ title: 'X', markets: [] }] }).markets, [])
})
