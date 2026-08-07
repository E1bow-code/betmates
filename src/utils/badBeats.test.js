import test from 'node:test'
import assert from 'node:assert/strict'
import { findBadBeats } from './badBeats.js'

const leg = (over) => ({ event: 'A v B', market: '1X2', selection: 'A', odds: 2, bookmaker: 'Bet365', ...over })

test('findBadBeats finds a multi that lost with exactly one leg wrong', () => {
  const entries = [
    {
      id: '1',
      status: 'lost',
      stake: 10,
      potentialReturn: 80,
      settledAt: '2026-08-01T12:00:00Z',
      selections: [leg({ selection: 'A' }), leg({ selection: 'B' }), leg({ selection: 'C' })],
      outcomes: ['won', 'lost', 'won']
    }
  ]
  const result = findBadBeats(entries)
  assert.equal(result.length, 1)
  assert.equal(result[0].legCount, 3)
  assert.equal(result[0].missedLeg.selection, 'B')
  assert.equal(result[0].wouldHaveReturned, 80)
})

test('findBadBeats excludes multis that lost on more than one leg', () => {
  const entries = [
    {
      id: '1',
      status: 'lost',
      stake: 10,
      selections: [leg(), leg(), leg()],
      outcomes: ['lost', 'lost', 'won']
    }
  ]
  assert.deepEqual(findBadBeats(entries), [])
})

test('findBadBeats excludes single-leg bets', () => {
  const entries = [{ id: '1', status: 'lost', stake: 10, selections: [leg()], outcomes: ['lost'] }]
  assert.deepEqual(findBadBeats(entries), [])
})

test('findBadBeats excludes manually-settled multis with no outcomes recorded', () => {
  const entries = [{ id: '1', status: 'lost', stake: 10, selections: [leg(), leg()], outcomes: null }]
  assert.deepEqual(findBadBeats(entries), [])
})

test('findBadBeats excludes wins and open bets', () => {
  const entries = [
    { id: '1', status: 'won', stake: 10, selections: [leg(), leg()], outcomes: ['won', 'won'] },
    { id: '2', status: 'open', stake: 10, selections: [leg(), leg()], outcomes: null }
  ]
  assert.deepEqual(findBadBeats(entries), [])
})

test('findBadBeats sorts more legs right ahead of fewer, then by bigger missed payout', () => {
  const entries = [
    { id: 'small', status: 'lost', stake: 10, potentialReturn: 20, selections: [leg(), leg()], outcomes: ['won', 'lost'] },
    {
      id: 'big-4leg',
      status: 'lost',
      stake: 10,
      potentialReturn: 200,
      selections: [leg(), leg(), leg(), leg()],
      outcomes: ['won', 'won', 'won', 'lost']
    },
    {
      id: 'small-3leg',
      status: 'lost',
      stake: 10,
      potentialReturn: 50,
      selections: [leg(), leg(), leg()],
      outcomes: ['won', 'won', 'lost']
    }
  ]
  const result = findBadBeats(entries)
  assert.deepEqual(result.map((r) => r.id), ['big-4leg', 'small-3leg', 'small'])
})

test('findBadBeats honours the limit', () => {
  const entries = Array.from({ length: 5 }, (_, i) => ({
    id: String(i),
    status: 'lost',
    stake: 10,
    selections: [leg(), leg()],
    outcomes: ['won', 'lost']
  }))
  assert.equal(findBadBeats(entries, 2).length, 2)
})

test('findBadBeats is safe on empty/missing input', () => {
  assert.deepEqual(findBadBeats([]), [])
  assert.deepEqual(findBadBeats(null), [])
})
