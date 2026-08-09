import test from 'node:test'
import assert from 'node:assert/strict'
import { computeChallengeStats, pickChallengeWinner, formatChallengeValue } from './challenge.js'

const WINDOW = { startsAt: '2026-07-01T00:00:00Z', endsAt: '2026-07-07T23:59:59Z' }

const post = (over) => ({ stake: 10, status: 'won', potentialReturn: 20, settledAt: '2026-07-03T12:00:00Z', ...over })

test('computeChallengeStats only counts bets settled inside the window', () => {
  const posts = [
    post(), // inside -> +£10
    post({ settledAt: '2026-06-30T23:59:59Z' }), // just before the window
    post({ settledAt: '2026-07-08T00:00:00Z' }) // just after the window
  ]
  const stats = computeChallengeStats(posts, WINDOW.startsAt, WINDOW.endsAt, 'profit')
  assert.equal(stats.settledCount, 1)
  assert.equal(stats.profit, 10)
})

test('computeChallengeStats scores pick\'em as a win/loss record on no-stake picks', () => {
  const posts = [
    post({ stake: null, status: 'won' }),
    post({ stake: null, status: 'lost' }),
    post({ stake: null, status: 'lost' }),
    post({ stake: 10, status: 'won' }) // a real staked bet - shouldn't count as a pick'em pick
  ]
  const stats = computeChallengeStats(posts, WINDOW.startsAt, WINDOW.endsAt, 'pickem')
  assert.deepEqual(stats, { wins: 1, losses: 2, decidedCount: 3 })
})

test('pickChallengeWinner picks the higher profit', () => {
  const a = computeChallengeStats([post()], WINDOW.startsAt, WINDOW.endsAt, 'profit')
  const b = computeChallengeStats([post({ status: 'lost', potentialReturn: 0 })], WINDOW.startsAt, WINDOW.endsAt, 'profit')
  assert.equal(pickChallengeWinner(a, b, 'profit'), 'a')
})

test('pickChallengeWinner picks the higher ROI, independent of raw profit', () => {
  // a stakes big for modest ROI, b stakes small for a big ROI - b should win on ROI
  const a = computeChallengeStats([post({ stake: 100, potentialReturn: 110 })], WINDOW.startsAt, WINDOW.endsAt, 'roi')
  const b = computeChallengeStats([post({ stake: 10, potentialReturn: 50 })], WINDOW.startsAt, WINDOW.endsAt, 'roi')
  assert.equal(pickChallengeWinner(a, b, 'roi'), 'b')
})

test('pickChallengeWinner breaks a pick\'em tie on wins first, then fewer losses', () => {
  const threeAndOne = { wins: 3, losses: 1, decidedCount: 4 }
  const twoAndZero = { wins: 2, losses: 0, decidedCount: 2 }
  assert.equal(pickChallengeWinner(threeAndOne, twoAndZero, 'pickem'), 'a')
  const threeAndTwo = { wins: 3, losses: 2, decidedCount: 5 }
  assert.equal(pickChallengeWinner(threeAndOne, threeAndTwo, 'pickem'), 'a')
})

test('pickChallengeWinner returns tie for identical records', () => {
  const a = computeChallengeStats([post()], WINDOW.startsAt, WINDOW.endsAt, 'profit')
  const b = computeChallengeStats([post()], WINDOW.startsAt, WINDOW.endsAt, 'profit')
  assert.equal(pickChallengeWinner(a, b, 'profit'), 'tie')
})

test('pickChallengeWinner returns null when neither side has anything decided', () => {
  const empty = computeChallengeStats([], WINDOW.startsAt, WINDOW.endsAt, 'profit')
  assert.equal(pickChallengeWinner(empty, empty, 'profit'), null)
  const emptyPickem = computeChallengeStats([], WINDOW.startsAt, WINDOW.endsAt, 'pickem')
  assert.equal(pickChallengeWinner(emptyPickem, emptyPickem, 'pickem'), null)
})

test('formatChallengeValue formats each metric distinctly', () => {
  assert.equal(formatChallengeValue({ profit: 12.5 }, 'profit'), '+£12.50')
  assert.equal(formatChallengeValue({ profit: -12.5 }, 'profit'), '£-12.50')
  assert.equal(formatChallengeValue({ roi: 25 }, 'roi'), '+25%')
  assert.equal(formatChallengeValue({ roi: null }, 'roi'), '—')
  assert.equal(formatChallengeValue({ wins: 3, losses: 1 }, 'pickem'), '3-1')
})
