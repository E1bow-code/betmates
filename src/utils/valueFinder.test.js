import test from 'node:test'
import assert from 'node:assert/strict'
import { findBoardValue } from './valueFinder.js'

const priced = (...prices) => prices.map(([bookmaker, decimal]) => ({ bookmaker, decimal }))

// A football fixture with an h2h market; `home`/`away` are [bookmaker, price] lists.
const fixture = (id, homeTeam, awayTeam, home, away) => ({
  id,
  homeTeam,
  awayTeam,
  markets: [{ key: 'h2h', outcomes: [{ name: 'Home', allOdds: home }, { name: 'Away', allOdds: away }].filter((o) => o.allOdds) }]
})

test('findBoardValue ranks edges richest-first and picks the bookie offering the best price', () => {
  const items = [
    // Home edge ~18% (2.6 vs avg 2.2), best at bookie C
    fixture('f1', 'Arsenal', 'Chelsea', priced(['A', 2.0], ['B', 2.0], ['C', 2.6]), priced(['A', 3.0], ['B', 3.0], ['C', 3.0])),
    // Home edge ~23.5% (7 vs avg 5.667) - should top the list
    fixture('f2', 'Spurs', 'City', priced(['A', 5.0], ['B', 5.0], ['C', 7.0]), null)
  ]
  const value = findBoardValue(items, 'football')
  assert.equal(value[0].matchup, 'Spurs v City')
  assert.equal(value[0].selection, 'Spurs') // Home resolves to the home team name
  assert.equal(value[0].best, 7.0)
  assert.equal(value[0].bookmaker, 'C')
  assert.ok(value[0].pct > value[1].pct) // strictly ranked by edge
})

test('findBoardValue skips fixtures with no h2h market entirely', () => {
  const items = [{ id: 'f3', homeTeam: 'X', awayTeam: 'Y', markets: [{ key: 'totals', outcomes: [] }] }]
  assert.deepEqual(findBoardValue(items, 'football'), [])
})

test('findBoardValue honours the limit', () => {
  const items = [
    fixture('f1', 'A', 'B', priced(['A', 2.0], ['B', 2.0], ['C', 2.6]), priced(['A', 5.0], ['B', 5.0], ['C', 7.0])),
    fixture('f2', 'C', 'D', priced(['A', 5.0], ['B', 5.0], ['C', 9.0]), null)
  ]
  assert.equal(findBoardValue(items, 'football', { limit: 1 }).length, 1)
})

test('findBoardValue keeps a fighter name as the selection for UFC', () => {
  const items = [
    { id: 'u1', fighterA: 'Jones', fighterB: 'Aspinall', markets: [{ key: 'h2h', outcomes: [{ name: 'Jones', allOdds: priced(['A', 2.0], ['B', 2.0], ['C', 2.6]) }] }] }
  ]
  const value = findBoardValue(items, 'ufc')
  assert.equal(value[0].matchup, 'Jones v Aspinall')
  assert.equal(value[0].selection, 'Jones')
})

test('findBoardValue tolerates empty input', () => {
  assert.deepEqual(findBoardValue([], 'football'), [])
  assert.deepEqual(findBoardValue(undefined, 'football'), [])
})
