import test from 'node:test'
import assert from 'node:assert/strict'
import { computeTournamentStandings } from './groupTournament.js'

const post = (over) => ({
  userId: 'u',
  stake: 10,
  status: 'won',
  potentialReturn: 20,
  settledAt: '2026-08-01T12:00:00Z',
  ...over
})

const names = { A: 'Ace', B: 'Bee' }
const startsAt = '2026-08-01T00:00:00Z'
const endsAt = '2026-08-31T23:59:59Z'

test('computeTournamentStandings ranks by profit, richest first, with rank baked in', () => {
  const posts = [
    post({ userId: 'A' }), // +£10
    post({ userId: 'A' }), // +£10 -> £20 total
    post({ userId: 'B' }), // +£10
    post({ userId: 'B', status: 'lost', potentialReturn: 0 }) // -£10 -> £0 total
  ]
  const ranked = computeTournamentStandings(posts, names, startsAt, endsAt, 'profit')
  assert.equal(ranked.length, 2)
  assert.equal(ranked[0].userId, 'A')
  assert.equal(ranked[0].rank, 1)
  assert.equal(ranked[0].name, 'Ace')
  assert.equal(ranked[0].profit, 20)
  assert.equal(ranked[1].userId, 'B')
  assert.equal(ranked[1].rank, 2)
})

test('computeTournamentStandings ranks by ROI when asked, not profit', () => {
  const posts = [
    // A: big stake, modest ROI
    post({ userId: 'A', stake: 100, status: 'won', potentialReturn: 110 }), // +£10 profit, 10% ROI
    // B: small stake, better ROI
    post({ userId: 'B', stake: 10, status: 'won', potentialReturn: 15 }) // +£5 profit, 50% ROI
  ]
  const byProfit = computeTournamentStandings(posts, names, startsAt, endsAt, 'profit')
  assert.equal(byProfit[0].userId, 'A')

  const byRoi = computeTournamentStandings(posts, names, startsAt, endsAt, 'roi')
  assert.equal(byRoi[0].userId, 'B')
})

test('computeTournamentStandings excludes bets settled outside the window', () => {
  const posts = [post({ userId: 'A', settledAt: '2026-09-05T12:00:00Z' })]
  assert.deepEqual(computeTournamentStandings(posts, names, startsAt, endsAt, 'profit'), [])
})

test('computeTournamentStandings ignores stake-hidden posts', () => {
  const posts = [post({ userId: 'A', stakeHidden: true })]
  assert.deepEqual(computeTournamentStandings(posts, names, startsAt, endsAt, 'profit'), [])
})

test('computeTournamentStandings excludes unsettled bets', () => {
  const posts = [post({ userId: 'A', status: 'open', settledAt: null })]
  assert.deepEqual(computeTournamentStandings(posts, names, startsAt, endsAt, 'profit'), [])
})

test('computeTournamentStandings returns an empty list with nothing settled', () => {
  assert.deepEqual(computeTournamentStandings([], names, startsAt, endsAt, 'profit'), [])
})
