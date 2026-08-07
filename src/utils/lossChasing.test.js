import test from 'node:test'
import assert from 'node:assert/strict'
import { detectLossChasing } from './lossChasing.js'

const entry = (over) => ({
  stake: 10,
  status: 'lost',
  settledAt: '2026-08-01T12:00:00Z',
  ...over
})

test('detectLossChasing flags a stake 50%+ bigger than the last loss', () => {
  const entries = [entry({ stake: 10, status: 'lost' })]
  const result = detectLossChasing(entries, 20)
  assert.deepEqual(result, { lastStake: 10, candidateStake: 20, increasePct: 100 })
})

test('detectLossChasing ignores a stake at or below the chase threshold', () => {
  const entries = [entry({ stake: 10, status: 'lost' })]
  assert.equal(detectLossChasing(entries, 15), null) // exactly 1.5x - not over the line
  assert.equal(detectLossChasing(entries, 10), null) // same as before
  assert.equal(detectLossChasing(entries, 5), null) // smaller
})

test('detectLossChasing only looks at the most recent settled bet, not any past loss', () => {
  const entries = [
    entry({ stake: 10, status: 'won', settledAt: '2026-08-02T12:00:00Z' }), // most recent - a win
    entry({ stake: 10, status: 'lost', settledAt: '2026-08-01T12:00:00Z' })
  ]
  assert.equal(detectLossChasing(entries, 50), null)
})

test('detectLossChasing ignores open (unsettled) entries', () => {
  const entries = [entry({ stake: 10, status: 'open', settledAt: null })]
  assert.equal(detectLossChasing(entries, 100), null)
})

test('detectLossChasing is safe on empty/missing input and no candidate stake', () => {
  assert.equal(detectLossChasing([], 20), null)
  assert.equal(detectLossChasing(null, 20), null)
  assert.equal(detectLossChasing([entry({})], null), null)
  assert.equal(detectLossChasing([entry({})], 0), null)
})
