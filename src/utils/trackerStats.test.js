import test from 'node:test'
import assert from 'node:assert/strict'
import {
  computeStats,
  computeStreak,
  computeLongestWinStreak,
  computeBestWeek,
  computePerfectWeek,
  computeBestWin,
  computeMilestoneBadges
} from './trackerStats.js'

const e = (over) => ({
  stake: 10,
  status: 'won',
  potentialReturn: 20,
  settledAt: '2026-01-05T12:00:00Z',
  selections: [{ event: 'Test' }],
  ...over
})

// --- computeStats -----------------------------------------------------------

test('computeStats sums staked/profit and derives win rate and ROI', () => {
  const entries = [
    e({ status: 'won', stake: 10, potentialReturn: 20 }), // +10 profit
    e({ status: 'lost', stake: 10, potentialReturn: 0 }), // -10 profit
    e({ status: 'void', stake: 10, potentialReturn: 10 }), // stake back, 0 profit
    e({ status: 'open', stake: 10 }) // not settled - excluded entirely
  ]
  const stats = computeStats(entries)
  assert.equal(stats.staked, 30)
  assert.equal(stats.profit, 0)
  assert.equal(stats.winRate, 50)
  assert.equal(stats.roi, 0)
  assert.equal(stats.settledCount, 3)
  assert.equal(stats.openCount, 1)
  assert.equal(stats.decidedCount, 2)
})

test('computeStats reports no win rate/ROI when nothing is settled', () => {
  const stats = computeStats([e({ status: 'open', stake: 10 })])
  assert.equal(stats.winRate, null)
  assert.equal(stats.roi, null)
})

// --- computeStreak -----------------------------------------------------------

test('computeStreak counts the current run, most recent first', () => {
  const entries = [
    e({ status: 'won', settledAt: '2026-01-03T00:00:00Z' }),
    e({ status: 'won', settledAt: '2026-01-02T00:00:00Z' }),
    e({ status: 'lost', settledAt: '2026-01-01T00:00:00Z' })
  ]
  assert.deepEqual(computeStreak(entries), { type: 'won', count: 2 })
})

test('computeStreak skips void bets rather than breaking the streak', () => {
  const entries = [
    e({ status: 'won', settledAt: '2026-01-03T00:00:00Z' }),
    e({ status: 'void', settledAt: '2026-01-02T00:00:00Z' }), // not won/lost, filtered out entirely
    e({ status: 'won', settledAt: '2026-01-01T00:00:00Z' })
  ]
  assert.deepEqual(computeStreak(entries), { type: 'won', count: 2 })
})

test('computeStreak is a zero streak with no decided bets', () => {
  assert.deepEqual(computeStreak([]), { type: null, count: 0 })
  assert.deepEqual(computeStreak([e({ status: 'open' })]), { type: null, count: 0 })
})

// --- computeLongestWinStreak --------------------------------------------------

test('computeLongestWinStreak finds the longest historical run, not just the current one', () => {
  const entries = [
    e({ status: 'won', settledAt: '2026-01-01T00:00:00Z' }),
    e({ status: 'won', settledAt: '2026-01-02T00:00:00Z' }),
    e({ status: 'won', settledAt: '2026-01-03T00:00:00Z' }),
    e({ status: 'lost', settledAt: '2026-01-04T00:00:00Z' }),
    e({ status: 'won', settledAt: '2026-01-05T00:00:00Z' })
  ]
  assert.equal(computeLongestWinStreak(entries), 3)
})

test('computeLongestWinStreak is 0 with no wins', () => {
  assert.equal(computeLongestWinStreak([e({ status: 'lost' })]), 0)
})

// --- computeBestWeek / computePerfectWeek -------------------------------------
// Both group by Sunday-start week - these two settledAt dates are more than
// a week apart so they always land in different weeks regardless of which
// day of the week Jan 5 itself falls on.

test('computeBestWeek picks the highest-profit week', () => {
  const entries = [
    e({ status: 'won', stake: 10, potentialReturn: 100, settledAt: '2026-01-05T12:00:00Z' }), // +90
    e({ status: 'lost', stake: 10, potentialReturn: 0, settledAt: '2026-01-15T12:00:00Z' }) // -10
  ]
  assert.equal(computeBestWeek(entries).profit, 90)
})

test('computeBestWeek is null with nothing settled', () => {
  assert.equal(computeBestWeek([e({ status: 'open' })]), null)
})

test('computePerfectWeek needs at least 2 wins with no losses in the same week', () => {
  const oneWin = [e({ status: 'won', settledAt: '2026-01-05T12:00:00Z' })]
  assert.equal(computePerfectWeek(oneWin), null)

  const twoWins = [
    e({ status: 'won', settledAt: '2026-01-05T12:00:00Z' }),
    e({ status: 'won', settledAt: '2026-01-06T12:00:00Z' })
  ]
  assert.equal(computePerfectWeek(twoWins).count, 2)

  const winAndLoss = [
    e({ status: 'won', settledAt: '2026-01-05T12:00:00Z' }),
    e({ status: 'lost', settledAt: '2026-01-06T12:00:00Z' })
  ]
  assert.equal(computePerfectWeek(winAndLoss), null)
})

// --- computeBestWin -----------------------------------------------------------

test('computeBestWin finds the single biggest-profit settled win', () => {
  const entries = [
    e({ status: 'won', stake: 10, potentialReturn: 20, selections: [{ event: 'Small win' }] }),
    e({ status: 'won', stake: 10, potentialReturn: 100, selections: [{ event: 'Big win' }] }),
    e({ status: 'lost', stake: 10, potentialReturn: 0, selections: [{ event: 'A loss' }] })
  ]
  const best = computeBestWin(entries)
  assert.equal(best.profit, 90)
  assert.equal(best.event, 'Big win')
})

test('computeBestWin is null with no wins', () => {
  assert.equal(computeBestWin([e({ status: 'lost' })]), null)
})

// --- computeMilestoneBadges ---------------------------------------------------

test('computeMilestoneBadges flags the first win only while it is still the only one', () => {
  const badges1 = computeMilestoneBadges([e({ status: 'won' })])
  assert.ok(badges1.some((b) => b.label === 'First win logged'))

  const badges2 = computeMilestoneBadges([e({ status: 'won' }), e({ status: 'won' })])
  assert.ok(!badges2.some((b) => b.label === 'First win logged'))
})

test('computeMilestoneBadges shows only the highest bets-logged tier crossed', () => {
  const entries = Array.from({ length: 12 }, () => e({ status: 'won' }))
  const badges = computeMilestoneBadges(entries)
  assert.ok(badges.some((b) => b.label === '10 bets logged'))
  assert.ok(!badges.some((b) => b.label === '50 bets logged'))
})

test('computeMilestoneBadges shows only the highest profit tier crossed', () => {
  const badges = computeMilestoneBadges([e({ status: 'won', stake: 50, potentialReturn: 150 })]) // +100 profit
  assert.ok(badges.some((b) => b.label === '+£100 lifetime profit'))
  assert.ok(!badges.some((b) => b.label === '+£50 lifetime profit'))
})
