import test from 'node:test'
import assert from 'node:assert/strict'
import { computeGroupLeaderboard, computeGroupClvLeaderboard, computeSeasonWinner, computeSeasonClvWinner } from './groupLeaderboard.js'

// A group bet post. Defaults to a settled win; override per case.
const post = (over) => ({
  userId: 'u',
  stake: 10,
  status: 'won',
  potentialReturn: 20,
  settledAt: '2026-08-01T12:00:00Z',
  ...over
})

// A single-leg selection with real closing-line identity keys, defaulting
// to a price that beats the close set up in the tests below.
const leg = (odds) => ({ event: 'e', market: 'm', selection: 's', odds, bookmaker: 'Bet365', eventId: 'fx1', marketKey: 'h2h', outcomeName: 'Home' })

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

test('computeGroupClvLeaderboard ranks members by average CLV%, not profit', () => {
  const closes = { 'fx1|h2h|Home': 2.0 }
  const posts = [
    // A: two bets beating the close comfortably
    post({ userId: 'A', selections: [leg(2.4)] }),
    post({ userId: 'A', selections: [leg(2.2)] }),
    post({ userId: 'A', selections: [leg(2.3)] }),
    // B: three bets barely beating the close - lower avg CLV than A even
    // though B could easily have more profit depending on results
    post({ userId: 'B', selections: [leg(2.02)] }),
    post({ userId: 'B', selections: [leg(2.01)] }),
    post({ userId: 'B', selections: [leg(2.03)] })
  ]
  const ranked = computeGroupClvLeaderboard(posts, names, closes, 'all')
  assert.equal(ranked.length, 2)
  assert.equal(ranked[0].userId, 'A')
  assert.equal(ranked[0].rank, 1)
  assert.ok(ranked[0].clv.avgPct > ranked[1].clv.avgPct)
})

test('computeGroupClvLeaderboard omits members below the minimum sample', () => {
  const closes = { 'fx1|h2h|Home': 2.0 }
  const posts = [post({ userId: 'A', selections: [leg(2.4)] }), post({ userId: 'A', selections: [leg(2.3)] })]
  assert.deepEqual(computeGroupClvLeaderboard(posts, names, closes, 'all'), [])
})

test('computeGroupClvLeaderboard does not drop stake-hidden posts', () => {
  const closes = { 'fx1|h2h|Home': 2.0 }
  const posts = [
    post({ userId: 'A', stakeHidden: true, selections: [leg(2.4)] }),
    post({ userId: 'A', stakeHidden: true, selections: [leg(2.3)] }),
    post({ userId: 'A', stakeHidden: true, selections: [leg(2.2)] })
  ]
  const ranked = computeGroupClvLeaderboard(posts, names, closes, 'all')
  assert.equal(ranked.length, 1)
})

test('computeSeasonWinner picks the top-profit member settled within the given month', () => {
  const posts = [
    post({ userId: 'A', settledAt: '2026-07-15T12:00:00Z' }), // +£10 in July
    post({ userId: 'A', settledAt: '2026-07-20T12:00:00Z' }), // +£10 in July -> £20 total
    post({ userId: 'B', settledAt: '2026-07-18T12:00:00Z' }), // +£10 in July
    post({ userId: 'A', settledAt: '2026-08-02T12:00:00Z' }) // outside the period entirely
  ]
  const winner = computeSeasonWinner(posts, names, '2026-07')
  assert.equal(winner.userId, 'A')
  assert.equal(winner.profit, 20)
})

test('computeSeasonWinner returns null when nothing settled in that month', () => {
  const posts = [post({ userId: 'A', settledAt: '2026-06-15T12:00:00Z' })]
  assert.equal(computeSeasonWinner(posts, names, '2026-07'), null)
})

test('computeSeasonClvWinner picks the sharpest tipster by CLV within the month', () => {
  const closes = { 'fx1|h2h|Home': 2.0 }
  const posts = [
    // July: A beats the close by a lot, B only barely
    post({ userId: 'A', settledAt: '2026-07-10T12:00:00Z', selections: [leg(2.4)] }),
    post({ userId: 'A', settledAt: '2026-07-11T12:00:00Z', selections: [leg(2.3)] }),
    post({ userId: 'A', settledAt: '2026-07-12T12:00:00Z', selections: [leg(2.2)] }),
    post({ userId: 'B', settledAt: '2026-07-10T12:00:00Z', selections: [leg(2.02)] }),
    post({ userId: 'B', settledAt: '2026-07-11T12:00:00Z', selections: [leg(2.01)] }),
    post({ userId: 'B', settledAt: '2026-07-12T12:00:00Z', selections: [leg(2.03)] }),
    // August: outside the period, must not count
    post({ userId: 'B', settledAt: '2026-08-01T12:00:00Z', selections: [leg(5.0)] })
  ]
  const winner = computeSeasonClvWinner(posts, names, closes, '2026-07')
  assert.equal(winner.userId, 'A')
  assert.ok(winner.clv.avgPct > 0)
})

test('computeSeasonClvWinner returns null when nobody clears the CLV sample that month', () => {
  const closes = { 'fx1|h2h|Home': 2.0 }
  const posts = [post({ userId: 'A', settledAt: '2026-07-10T12:00:00Z', selections: [leg(2.4)] })]
  assert.equal(computeSeasonClvWinner(posts, names, closes, '2026-07'), null)
})
