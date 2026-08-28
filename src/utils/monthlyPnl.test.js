import test from 'node:test'
import assert from 'node:assert/strict'
import { computeMonthlyPnl } from './monthlyPnl.js'

const NOW = new Date('2026-08-28T12:00:00Z')
const bet = (over) => ({ status: 'won', stake: 10, potentialReturn: 20, settledAt: '2026-08-10T12:00:00Z', ...over })

test('computeMonthlyPnl sums only bets settled in the current month', () => {
  const entries = [
    bet(), // Aug win +10
    bet({ settledAt: '2026-08-20T12:00:00Z', status: 'lost', potentialReturn: 0 }), // Aug loss -10
    bet({ settledAt: '2026-07-31T23:00:00Z' }) // July - excluded
  ]
  const out = computeMonthlyPnl(entries, NOW)
  assert.equal(out.label, 'August')
  assert.equal(out.settledCount, 2)
  assert.equal(out.profit, 0) // +10 - 10
  assert.equal(out.staked, 20)
})

test('computeMonthlyPnl ignores still-open bets', () => {
  const entries = [bet({ status: 'open', settledAt: null }), bet()]
  assert.equal(computeMonthlyPnl(entries, NOW).settledCount, 1)
})

test('computeMonthlyPnl returns null when nothing settled this month', () => {
  assert.equal(computeMonthlyPnl([bet({ settledAt: '2026-07-10T12:00:00Z' })], NOW), null)
  assert.equal(computeMonthlyPnl([], NOW), null)
})

test('computeMonthlyPnl is deterministic on the settledAt month regardless of runner timezone', () => {
  // A bet settled at the very start of the month in UTC still counts for that month.
  const entries = [bet({ settledAt: '2026-08-01T00:30:00Z' })]
  assert.equal(computeMonthlyPnl(entries, NOW).settledCount, 1)
})
