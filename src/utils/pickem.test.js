import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computePickemLeaderboard } from './pickem.js'

// The leaderboard scores THIS week, so fixtures are anchored to now: `now` is
// always inside the current week (>= its Sunday-00:00 start), and 10 days ago
// is always before it, no matter which day the suite runs.
const now = new Date().toISOString()
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString()

// A pick'em entry: a stakeless post settled this week as won/lost.
const pick = (o) => ({ userId: 'u1', stake: 0, settledAt: now, status: 'won', ...o })

test('only stakeless, settled-this-week, won/lost posts count as picks', () => {
  const posts = [
    pick({ status: 'won' }),
    pick({ status: 'lost' }),
    pick({ stake: 10 }), // real-money bet - excluded
    pick({ status: 'open', settledAt: null }), // unsettled - excluded
    pick({ status: 'void' }), // void isn't won/lost - excluded
    pick({ settledAt: daysAgo(10) }) // settled last week - excluded
  ]
  const board = computePickemLeaderboard(posts, {})
  assert.equal(board.length, 1)
  assert.deepEqual({ wins: board[0].wins, losses: board[0].losses }, { wins: 1, losses: 1 })
})

test('picks are grouped per user and ranked by wins, then fewest losses', () => {
  const posts = [
    pick({ userId: 'a', status: 'won' }),
    pick({ userId: 'a', status: 'won' }), // a: 2-0
    pick({ userId: 'b', status: 'won' }),
    pick({ userId: 'b', status: 'lost' }), // b: 1-1
    pick({ userId: 'c', status: 'won' }) // c: 1-0
  ]
  const board = computePickemLeaderboard(posts, { a: 'Ann', b: 'Bo', c: 'Cy' })
  assert.deepEqual(board.map((r) => r.name), ['Ann', 'Cy', 'Bo'])
  // a first on 2 wins; c ahead of b on the same 1 win with fewer losses.
  assert.deepEqual(board.map((r) => [r.wins, r.losses]), [[2, 0], [1, 0], [1, 1]])
})

test('an unknown member id falls back to "Someone"', () => {
  const board = computePickemLeaderboard([pick({ userId: 'ghost' })], {})
  assert.equal(board[0].name, 'Someone')
})

test('no qualifying picks yields an empty board', () => {
  assert.deepEqual(computePickemLeaderboard([pick({ stake: 5 })], {}), [])
  assert.deepEqual(computePickemLeaderboard([], {}), [])
})
