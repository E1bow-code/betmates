import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeGroupRecap } from './groupRecap.js'

// computeGroupRecap takes `now` as a param, so fixtures anchor to a fixed clock.
const NOW = Date.parse('2026-08-30T12:00:00Z')
const daysAgo = (n) => new Date(NOW - n * 86_400_000).toISOString()
// A settled bet this week. Defaults to a +20 win (stake 10 -> returns 30).
const bet = (o = {}) => ({
  userId: 'u1',
  stake: 10,
  status: 'won',
  potentialReturn: 30,
  settledAt: daysAgo(1),
  selections: [{ event: 'A v B' }],
  ...o
})

test('returns null when nothing qualifies this week', () => {
  assert.equal(computeGroupRecap([], {}, NOW), null)
  assert.equal(computeGroupRecap(null, {}, NOW), null)
  // stake-less, unsettled, and stale bets are all excluded
  assert.equal(computeGroupRecap([bet({ stake: 0 })], {}, NOW), null)
  assert.equal(computeGroupRecap([bet({ status: 'open', settledAt: null })], {}, NOW), null)
  assert.equal(computeGroupRecap([bet({ settledAt: daysAgo(10) })], {}, NOW), null)
})

test('aggregates settled count, active members, and net group profit', () => {
  const r = computeGroupRecap(
    [
      bet({ userId: 'u1', status: 'won', stake: 10, potentialReturn: 30 }), // +20
      bet({ userId: 'u1', status: 'lost', stake: 10 }), // -10
      bet({ userId: 'u2', status: 'won', stake: 5, potentialReturn: 15 }) // +10
    ],
    {},
    NOW
  )
  assert.equal(r.settledCount, 3)
  assert.equal(r.activeCount, 2) // u1, u2
  assert.equal(r.groupProfit, 20) // +20 -10 +10
})

test('betProfit rules: a void is neutral, a loss costs the stake', () => {
  const r = computeGroupRecap(
    [
      bet({ userId: 'u1', status: 'void', stake: 10 }), // 0
      bet({ userId: 'u2', status: 'lost', stake: 8 }) // -8
    ],
    {},
    NOW
  )
  assert.equal(r.settledCount, 2)
  assert.equal(r.groupProfit, -8)
})

test('topTipster is the best net profit, with the name resolved', () => {
  const r = computeGroupRecap(
    [
      bet({ userId: 'u1', status: 'won', stake: 10, potentialReturn: 30 }), // +20
      bet({ userId: 'u2', status: 'won', stake: 5, potentialReturn: 15 }) // +10
    ],
    { u1: 'Ann', u2: 'Bo' },
    NOW
  )
  assert.equal(r.topTipster.userId, 'u1')
  assert.equal(r.topTipster.name, 'Ann')
  assert.equal(r.topTipster.profit, 20)
  assert.equal(r.topTipster.settledCount, 1)
})

test('a profit tie for top goes to whoever settled more bets', () => {
  const r = computeGroupRecap(
    [
      // u1: two bets netting +10 (win +20, loss -10)
      bet({ userId: 'u1', status: 'won', stake: 10, potentialReturn: 30 }),
      bet({ userId: 'u1', status: 'lost', stake: 10 }),
      // u2: one bet netting +10
      bet({ userId: 'u2', status: 'won', stake: 10, potentialReturn: 20 })
    ],
    {},
    NOW
  )
  assert.equal(r.topTipster.profit, 10)
  assert.equal(r.topTipster.userId, 'u1') // tie broken by settledCount (2 > 1)
})

test('biggestWin is the largest single winning bet, or null when nobody won', () => {
  const r = computeGroupRecap(
    [
      bet({ userId: 'u1', status: 'won', stake: 10, potentialReturn: 30, selections: [{ event: 'A v B' }, { event: 'C v D' }] }), // +20, 2 legs
      bet({ userId: 'u3', status: 'won', stake: 10, potentialReturn: 60 }) // +50, 1 leg
    ],
    { u3: 'Cy' },
    NOW
  )
  assert.equal(r.biggestWin.userId, 'u3')
  assert.equal(r.biggestWin.name, 'Cy')
  assert.equal(r.biggestWin.profit, 50)
  assert.equal(r.biggestWin.event, 'A v B') // from the winning post's first selection
  assert.equal(r.biggestWin.legs, 1)

  const noWins = computeGroupRecap([bet({ status: 'lost', stake: 10 })], {}, NOW)
  assert.equal(noWins.biggestWin, null)
})

test('an unknown member id falls back to "Someone"', () => {
  const r = computeGroupRecap([bet({ userId: 'ghost' })], {}, NOW)
  assert.equal(r.topTipster.name, 'Someone')
})
