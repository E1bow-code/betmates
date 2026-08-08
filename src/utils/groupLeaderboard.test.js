import test from 'node:test'
import assert from 'node:assert/strict'
import { computeGroupLeaderboard } from './groupLeaderboard.js'

// A group bet post. Defaults to a settled win; override per case.
const post = (over) => ({
  userId: 'u',
  stake: 10,
  status: 'won',
  potentialReturn: 20,
  settledAt: '2026-08-01T12:00:00Z',
  ...over
})

const names = { A: 'Ace', B: 'Bee', C: 'Cee' }

test('computeGroupLeaderboard ranks by profit, richest first, with rank baked in', () => {
  const posts = [
    // A: 2 wins -> +£20
    post({ userId: 'A' }),
    post({ userId: 'A' }),
    // B: 1 win, 1 loss -> £10 - £10 = £0
    post({ userId: 'B' }),
    post({ userId: 'B', status: 'lost', potentialReturn: 0 })
  ]
  const ranked = computeGroupLeaderboard(posts, names, 'all')
  assert.equal(ranked.length, 2)
  assert.equal(ranked[0].userId, 'A')
  assert.equal(ranked[0].rank, 1)
  assert.equal(ranked[0].name, 'Ace')
  assert.equal(ranked[0].profit, 20)
  assert.equal(ranked[1].userId, 'B')
  assert.equal(ranked[1].rank, 2)
})

test('computeGroupLeaderboard ignores stake-hidden posts (no visible P&L to rank on)', () => {
  const posts = [post({ userId: 'A', stakeHidden: true })]
  assert.deepEqual(computeGroupLeaderboard(posts, names, 'all'), [])
})

test('computeGroupLeaderboard excludes users with nothing settled', () => {
  const posts = [post({ userId: 'A', status: 'open', settledAt: null })]
  assert.deepEqual(computeGroupLeaderboard(posts, names, 'all'), [])
})

test('computeGroupLeaderboard filters by settlement window', () => {
  const posts = [post({ userId: 'A', settledAt: '2020-01-01T00:00:00Z' })]
  assert.equal(computeGroupLeaderboard(posts, names, 'all').length, 1)
  assert.deepEqual(computeGroupLeaderboard(posts, names, 'week'), [])
})

test('computeGroupLeaderboard falls back to "Someone" for an unknown name', () => {
  const posts = [post({ userId: 'Z' })]
  const ranked = computeGroupLeaderboard(posts, names, 'all')
  assert.equal(ranked[0].name, 'Someone')
})
