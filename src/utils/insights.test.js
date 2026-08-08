import test from 'node:test'
import assert from 'node:assert/strict'
import { computeInsights } from './insights.js'

const entry = (over) => ({
  createdAt: '2026-01-06T12:00:00Z', // a Tuesday
  settledAt: '2026-01-06T18:00:00Z',
  status: 'won',
  stake: 10,
  potentialReturn: 20,
  sport: 'football',
  marketType: 'Match Result',
  selections: [{ event: 'e', market: 'm', selection: 's', odds: 2.0, bookmaker: 'Bet365' }],
  ...over
})

test('computeInsights reports betting style once there are enough decided bets', () => {
  const entries = [
    entry({ status: 'won', potentialReturn: 30 }), // profit 20
    entry({ status: 'lost', potentialReturn: 0 }), // profit -10
    entry({ status: 'won', potentialReturn: 20 }), // profit 10
    entry({ status: 'lost', potentialReturn: 0 }) // profit -10
  ]
  const insights = computeInsights(entries)
  const volatility = insights.find((i) => i.key === 'volatility')
  assert.ok(volatility)
  // profits [20,-10,10,-10], avg 2.5, stdev ~12.99, avgStake 10 -> cv ~1.3 -> Balanced
  assert.equal(volatility.value, 'Balanced · £12.99 swing per bet')
})

test('computeInsights omits betting style below the minimum sample', () => {
  const entries = [entry({}), entry({ status: 'lost', potentialReturn: 0 }), entry({})]
  const insights = computeInsights(entries)
  assert.equal(
    insights.find((i) => i.key === 'volatility'),
    undefined
  )
})

test('computeInsights labels a low-variance record as steady', () => {
  // Every bet returns the same profit - no swing at all.
  const entries = [entry({}), entry({}), entry({}), entry({})]
  const insights = computeInsights(entries)
  const volatility = insights.find((i) => i.key === 'volatility')
  assert.equal(volatility.value, 'Steady · £0.00 swing per bet')
})

test('computeInsights reports CLV once there are enough single-leg bets with a real close', () => {
  const leg = (odds) => ({ event: 'e', market: 'm', selection: 's', odds, bookmaker: 'Bet365', eventId: 'fx1', marketKey: 'h2h', outcomeName: 'Home' })
  const entries = [entry({ selections: [leg(2.2)] }), entry({ selections: [leg(2.1)] }), entry({ selections: [leg(1.9)] })]
  const closes = { 'fx1|h2h|Home': 2.0 }
  const insights = computeInsights(entries, closes)
  const clv = insights.find((i) => i.key === 'clv')
  assert.ok(clv)
  assert.equal(clv.title, 'Beating the market')
  assert.match(clv.value, /vs\. closing line/)
})

test('computeInsights omits CLV without a closes map', () => {
  const leg = { event: 'e', market: 'm', selection: 's', odds: 2.2, bookmaker: 'Bet365', eventId: 'fx1', marketKey: 'h2h', outcomeName: 'Home' }
  const entries = [entry({ selections: [leg] }), entry({ selections: [leg] }), entry({ selections: [leg] })]
  const insights = computeInsights(entries)
  assert.equal(
    insights.find((i) => i.key === 'clv'),
    undefined
  )
})
