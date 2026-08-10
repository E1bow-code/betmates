import test from 'node:test'
import assert from 'node:assert/strict'
import { computeTipsterRankings, MIN_SETTLED_TO_RANK } from './tipsters.js'

// A public-feed post. Defaults to a settled win; override per case.
const post = (over) => ({
  userId: 'u',
  authorName: 'Someone',
  authorCode: 'CODE',
  stake: 10,
  status: 'won',
  potentialReturn: 20,
  settledAt: '2026-08-01T12:00:00Z',
  ...over
})

test('computeTipsterRankings ranks by ROI, sharpest first', () => {
  const feed = [
    // A: 3 wins -> +£30 on £30 staked -> ROI +100%
    post({ userId: 'A', authorName: 'Ace', authorCode: 'AAA' }),
    post({ userId: 'A' }),
    post({ userId: 'A' }),
    // B: 1 win, 2 losses -> -£10 on £30 -> ROI -33%
    post({ userId: 'B', authorName: 'Bee', authorCode: 'BBB' }),
    post({ userId: 'B', status: 'lost', potentialReturn: 0 }),
    post({ userId: 'B', status: 'lost', potentialReturn: 0 })
  ]
  const ranked = computeTipsterRankings(feed, 'all')
  assert.equal(ranked.length, 2)
  assert.equal(ranked[0].userId, 'A')
  assert.equal(ranked[0].roi, 100)
  assert.equal(ranked[0].code, 'AAA') // friend_code carried through for profile links
  assert.equal(ranked[1].userId, 'B')
  assert.ok(ranked[0].roi > ranked[1].roi)
})

test('computeTipsterRankings drops tipsters below the minimum settled sample', () => {
  const feed = Array.from({ length: MIN_SETTLED_TO_RANK - 1 }, () => post({ userId: 'C' }))
  assert.deepEqual(computeTipsterRankings(feed, 'all'), [])
})

test('computeTipsterRankings ignores stake-hidden posts (no visible P&L to rank on)', () => {
  const feed = [
    post({ userId: 'A' }),
    post({ userId: 'A' }),
    post({ userId: 'A', stakeHidden: true }) // this one shouldn't count toward the sample
  ]
  // Only 2 visible settled -> below the threshold -> unranked.
  assert.deepEqual(computeTipsterRankings(feed, 'all'), [])
})

test('computeTipsterRankings filters by settlement window', () => {
  const feed = [
    post({ userId: 'A', settledAt: '2020-01-01T00:00:00Z' }),
    post({ userId: 'A', settledAt: '2020-01-02T00:00:00Z' }),
    post({ userId: 'A', settledAt: '2020-01-03T00:00:00Z' })
  ]
  // All settled years ago: present under 'all', gone under 'week'.
  assert.equal(computeTipsterRankings(feed, 'all').length, 1)
  assert.deepEqual(computeTipsterRankings(feed, 'week'), [])
})

test('computeTipsterRankings returns null for a missing feed', () => {
  assert.equal(computeTipsterRankings(null), null)
})

test('computeTipsterRankings surfaces average CLV as a stat when closing lines are supplied', () => {
  // Three single-leg wins by A, all struck at 2.0; the market closed at 1.8, so
  // each beat the close. Keys match dataStore.getClosingLines / clv.js.
  const leg = (eventId) => ({ eventId, marketKey: 'h2h', outcomeName: 'Home', odds: 2.0 })
  const feed = [
    post({ userId: 'A', selections: [leg('e1')] }),
    post({ userId: 'A', selections: [leg('e2')] }),
    post({ userId: 'A', selections: [leg('e3')] })
  ]
  const closes = { 'e1|h2h|Home': 1.8, 'e2|h2h|Home': 1.8, 'e3|h2h|Home': 1.8 }
  const ranked = computeTipsterRankings(feed, 'all', closes)
  assert.equal(ranked.length, 1)
  assert.ok(ranked[0].clv, 'a clv stat is attached')
  assert.equal(ranked[0].clv.beatRate, 100)
  assert.ok(ranked[0].clv.avgPct > 0)
})

test('computeTipsterRankings leaves clv null when no closing lines are known', () => {
  // Still fully ranked by ROI - CLV is an optional stat, not a gate.
  const feed = [post({ userId: 'A' }), post({ userId: 'A' }), post({ userId: 'A' })]
  const ranked = computeTipsterRankings(feed, 'all')
  assert.equal(ranked.length, 1)
  assert.equal(ranked[0].clv, null)
})
