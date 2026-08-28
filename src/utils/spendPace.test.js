import test from 'node:test'
import assert from 'node:assert/strict'
import { computeSpendPace } from './spendPace.js'

const NOW = new Date('2026-08-28T12:00:00Z').getTime()
const daysAgo = (d) => new Date(NOW - d * 24 * 60 * 60 * 1000).toISOString()
const bet = (stake, createdAt) => ({ stake, createdAt })

test('computeSpendPace sums this week and averages the prior four weeks', () => {
  const entries = [
    bet(10, daysAgo(1)), // this week
    bet(20, daysAgo(3)), // this week -> 30
    bet(40, daysAgo(8)), // 1 week ago
    bet(40, daysAgo(15)), // 2 weeks ago
    bet(40, daysAgo(22)), // 3 weeks ago
    bet(40, daysAgo(29)) // 4 weeks ago -> prior sum 160, /4 = 40
  ]
  assert.deepEqual(computeSpendPace(entries, NOW), { thisWeek: 30, typical: 40 })
})

test('computeSpendPace returns null with no prior-weeks baseline', () => {
  assert.equal(computeSpendPace([bet(50, daysAgo(1))], NOW), null) // only this week
  assert.equal(computeSpendPace([], NOW), null)
})

test('computeSpendPace reports 0 for a quiet week when a baseline exists', () => {
  const entries = [bet(40, daysAgo(8)), bet(40, daysAgo(15))] // prior only, sum 80 -> avg 20
  assert.deepEqual(computeSpendPace(entries, NOW), { thisWeek: 0, typical: 20 })
})

test('computeSpendPace ignores stakeless/zero/future bets', () => {
  const entries = [
    bet(null, daysAgo(1)),
    bet(0, daysAgo(1)),
    bet(10, new Date(NOW + 86400000).toISOString()), // future
    bet(40, daysAgo(8)) // the only baseline
  ]
  assert.deepEqual(computeSpendPace(entries, NOW), { thisWeek: 0, typical: 10 })
})

test('computeSpendPace only counts up to 4 prior weeks, not older', () => {
  const entries = [
    bet(40, daysAgo(8)), // 1 week ago (baseline)
    bet(999, daysAgo(60)) // ~8 weeks ago - must not count
  ]
  assert.deepEqual(computeSpendPace(entries, NOW), { thisWeek: 0, typical: 10 })
})
