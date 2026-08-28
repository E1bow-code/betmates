import test from 'node:test'
import assert from 'node:assert/strict'
import { computeGroupConsensus } from './groupConsensus.js'

const NOW = new Date('2026-08-28T12:00:00Z').getTime()
const recent = new Date('2026-08-27T12:00:00Z').toISOString()

// A group bet post. Defaults to a recent, open, single-leg Arsenal bet.
const post = (over) => ({
  userId: 'a',
  status: 'open',
  createdAt: recent,
  selections: [{ event: 'Arsenal vs Chelsea', market: 'Match Result', selection: 'Arsenal', sport: 'football' }],
  ...over
})

test('computeGroupConsensus surfaces a pick backed by 2+ distinct members', () => {
  const posts = [post({ userId: 'a' }), post({ userId: 'b' }), post({ userId: 'c' })]
  const out = computeGroupConsensus(posts, { now: NOW })
  assert.equal(out.length, 1)
  assert.equal(out[0].selection, 'Arsenal')
  assert.equal(out[0].count, 3)
  assert.deepEqual([...out[0].backerIds].sort(), ['a', 'b', 'c'])
})

test('computeGroupConsensus needs distinct backers, not repeat posts from one member', () => {
  const posts = [post({ userId: 'a' }), post({ userId: 'a' }), post({ userId: 'a' })]
  assert.deepEqual(computeGroupConsensus(posts, { now: NOW }), []) // one member = no consensus
})

test('computeGroupConsensus ignores settled and stale bets', () => {
  const posts = [
    post({ userId: 'a' }),
    post({ userId: 'b', status: 'won' }), // settled - can't be tailed
    post({ userId: 'c', createdAt: '2026-01-01T00:00:00Z' }) // outside the window
  ]
  assert.deepEqual(computeGroupConsensus(posts, { now: NOW }), []) // only 'a' remains eligible
})

test('computeGroupConsensus counts a member once for a pick even across legs/bets', () => {
  const posts = [
    // 'a' has the same pick twice (a single and inside a multi) - counts once
    post({ userId: 'a' }),
    post({
      userId: 'a',
      selections: [
        { event: 'Arsenal vs Chelsea', market: 'Match Result', selection: 'Arsenal', sport: 'football' },
        { event: 'City vs Spurs', market: 'Match Result', selection: 'City', sport: 'football' }
      ]
    }),
    post({ userId: 'b' })
  ]
  const out = computeGroupConsensus(posts, { now: NOW })
  const arsenal = out.find((p) => p.selection === 'Arsenal')
  assert.equal(arsenal.count, 2) // a + b, not 3
})

test('computeGroupConsensus ranks by backer count and respects the limit', () => {
  const posts = [
    post({ userId: 'a' }),
    post({ userId: 'b' }),
    post({ userId: 'c' }), // Arsenal x3
    post({ userId: 'a', selections: [{ event: 'City vs Spurs', market: 'Match Result', selection: 'City', sport: 'football' }] }),
    post({ userId: 'b', selections: [{ event: 'City vs Spurs', market: 'Match Result', selection: 'City', sport: 'football' }] }) // City x2
  ]
  const out = computeGroupConsensus(posts, { now: NOW, limit: 1 })
  assert.equal(out.length, 1)
  assert.equal(out[0].selection, 'Arsenal') // more backers ranks first
})
