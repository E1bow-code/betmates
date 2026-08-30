import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeTrendingPicks } from './trending.js'

// Only posts inside the 7-day window count, so timestamps are anchored to now.
const now = new Date().toISOString()
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString()
// A post backing one selection.
const post = (event, market, selection, o = {}) => ({
  createdAt: now,
  stakeHidden: false,
  selections: [{ event, market, selection, sport: 'football' }],
  ...o
})

test('a selection backed by more than one post trends; a lone one does not', () => {
  const rows = computeTrendingPicks([
    post('Arsenal v Chelsea', '1X2', 'Arsenal'),
    post('Arsenal v Chelsea', '1X2', 'Arsenal'),
    post('Spurs v Everton', '1X2', 'Spurs') // only once - filtered out (count > 1)
  ])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].selection, 'Arsenal')
  assert.equal(rows[0].count, 2)
})

test('the exact selection is the key - same event/market but a different pick is separate', () => {
  const rows = computeTrendingPicks([
    post('Arsenal v Chelsea', '1X2', 'Arsenal'),
    post('Arsenal v Chelsea', '1X2', 'Arsenal'),
    post('Arsenal v Chelsea', '1X2', 'Chelsea'),
    post('Arsenal v Chelsea', '1X2', 'Chelsea')
  ])
  assert.deepEqual(
    rows.map((r) => [r.selection, r.count]).sort(),
    [['Arsenal', 2], ['Chelsea', 2]]
  )
})

test('stake-hidden posts and posts older than the 7-day window are ignored', () => {
  const rows = computeTrendingPicks([
    post('A v B', 'M', 'A'),
    post('A v B', 'M', 'A', { stakeHidden: true }), // hidden - not tallied
    post('A v B', 'M', 'A', { createdAt: daysAgo(10) }) // stale - not tallied
  ])
  // Only one visible in-window post remains, so the pick never reaches count > 1.
  assert.deepEqual(rows, [])
})

test('results are ranked by count and capped at the limit', () => {
  const posts = []
  for (let i = 0; i < 2; i++) posts.push(post('A v B', 'M', 'low'))
  for (let i = 0; i < 4; i++) posts.push(post('C v D', 'M', 'high'))
  const rows = computeTrendingPicks(posts, 1)
  assert.equal(rows.length, 1) // limit
  assert.equal(rows[0].selection, 'high') // highest count first
  assert.equal(rows[0].count, 4)
})

test('a multi-leg post tallies each of its legs', () => {
  const multi = { createdAt: now, stakeHidden: false, selections: [
    { event: 'A v B', market: 'M', selection: 'A', sport: 'football' },
    { event: 'C v D', market: 'M', selection: 'C', sport: 'football' }
  ] }
  const rows = computeTrendingPicks([multi, multi])
  assert.deepEqual(rows.map((r) => r.selection).sort(), ['A', 'C'])
  assert.ok(rows.every((r) => r.count === 2))
})
