import test from 'node:test'
import assert from 'node:assert/strict'
import { summariseOpenBets } from './openBets.js'

const row = (over) => ({
  status: 'open',
  stake: 10,
  potential_return: 21,
  selections: [{ event: 'Arsenal vs Chelsea', market: 'Match Result', selection: 'Arsenal', odds: 2.1 }],
  ...over
})

test('summariseOpenBets summarises open positions with staked total', () => {
  const out = summariseOpenBets([row(), row({ stake: 5, potential_return: 15 })])
  assert.equal(out.available, true)
  assert.equal(out.openCount, 2)
  assert.equal(out.totalStaked, 15)
  assert.deepEqual(out.positions[0].picks, ['Arsenal'])
  assert.deepEqual(out.positions[0].events, ['Arsenal vs Chelsea'])
  assert.equal(out.positions[0].potentialReturn, 21)
  assert.equal(out.positions[0].legs, 1)
})

test('summariseOpenBets ignores settled bets', () => {
  const out = summariseOpenBets([row({ status: 'won' }), row({ status: 'lost' })])
  assert.equal(out.available, false)
})

test('summariseOpenBets reports a multi with distinct events and picks', () => {
  const out = summariseOpenBets([
    row({
      selections: [
        { event: 'Arsenal vs Chelsea', selection: 'Arsenal', odds: 2.1 },
        { event: 'City vs Spurs', selection: 'City', odds: 1.5 }
      ]
    })
  ])
  assert.equal(out.positions[0].legs, 2)
  assert.deepEqual(out.positions[0].picks, ['Arsenal', 'City'])
  assert.deepEqual(out.positions[0].events, ['Arsenal vs Chelsea', 'City vs Spurs'])
})

test('summariseOpenBets tolerates a hidden/absent stake', () => {
  const out = summariseOpenBets([row({ stake: null, potential_return: null })])
  assert.equal(out.available, true)
  assert.equal(out.totalStaked, 0)
  assert.equal(out.positions[0].stake, null)
  assert.equal(out.positions[0].potentialReturn, null)
})

test('summariseOpenBets also reads a camelCase potentialReturn', () => {
  const out = summariseOpenBets([{ status: 'open', stake: 10, potentialReturn: 30, selections: [{ event: 'e', selection: 's', odds: 3 }] }])
  assert.equal(out.positions[0].potentialReturn, 30)
})

test('summariseOpenBets returns unavailable for an empty list', () => {
  assert.equal(summariseOpenBets([]).available, false)
  assert.equal(summariseOpenBets(null).available, false)
})
