import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCoachSummary } from './coachSummary.js'

// Three settled bets: two football wins, one tennis loss, one of the wins an
// acca. Enough to exercise every branch of the summary.
const entries = [
  {
    stake: 10, potentialReturn: 25, status: 'won', sport: 'football', marketType: 'Match Result', odds: 2.5,
    createdAt: '2026-08-01T12:00:00Z', settledAt: '2026-08-01T14:00:00Z',
    selections: [{ bookmaker: 'Bet365', odds: 2.5, event: 'Arsenal v Spurs' }]
  },
  {
    stake: 20, potentialReturn: 0, status: 'lost', sport: 'tennis', marketType: 'Match Result', odds: 1.8,
    createdAt: '2026-08-02T12:00:00Z', settledAt: '2026-08-02T14:00:00Z',
    selections: [{ bookmaker: 'Bet365', odds: 1.8, event: 'Alcaraz v Sinner' }]
  },
  {
    stake: 5, potentialReturn: 40, status: 'won', sport: 'football', marketType: 'Acca', odds: 8,
    createdAt: '2026-08-03T12:00:00Z', settledAt: '2026-08-03T14:00:00Z',
    selections: [{ bookmaker: 'Paddy', odds: 2 }, { bookmaker: 'Paddy', odds: 4 }]
  }
]

test('buildCoachSummary rolls entries into aggregate headline numbers', () => {
  const s = buildCoachSummary(entries)
  assert.equal(s.settled, 3)
  assert.equal(s.winRate, 67) // 2 of 3 decided
  assert.equal(s.profit, 30) // +15 -20 +35
  assert.equal(s.roi, 85.7) // 30 / 35 staked
  assert.equal(s.biggestStake, 20)
  assert.ok(Math.abs(s.avgStake - 35 / 3) < 1e-6)
})

test('buildCoachSummary names the best and worst sport by net P&L', () => {
  const s = buildCoachSummary(entries)
  assert.equal(s.topSport, 'Football (+£50.00)') // +15 and +35
  assert.equal(s.worstSport, 'Tennis (£-20.00)')
})

test('buildCoachSummary reflects markets, bookies, odds, acca share and streak', () => {
  const s = buildCoachSummary(entries)
  assert.equal(s.topMarket, 'Match Result (50%)') // 1 of 2 decided; Acca (1 bet) too thin to rank
  assert.equal(s.favBookmaker, 'Bet365 (2 picks)')
  assert.ok(Math.abs(s.avgOdds - 4.1) < 1e-6)
  assert.equal(s.accaShare, 33) // 1 of 3 entries has >1 leg
  assert.equal(s.currentStreak, 1) // most recent settled bet was a win, prior was a loss
})

test('buildCoachSummary omits worstSport when there is only one sport', () => {
  const oneSport = entries.filter((e) => e.sport === 'football')
  const s = buildCoachSummary(oneSport)
  assert.equal(s.worstSport, undefined)
  assert.ok(s.topSport.startsWith('Football'))
})

test('buildCoachSummary is safe on an empty history', () => {
  const s = buildCoachSummary([])
  assert.equal(s.settled, 0)
  assert.equal(s.winRate, undefined)
})
