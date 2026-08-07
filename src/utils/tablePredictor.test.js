import test from 'node:test'
import assert from 'node:assert/strict'
import { scorePrediction, rankPredictions } from './tablePredictor.js'

test('scorePrediction is 0 for a perfect prediction', () => {
  assert.equal(scorePrediction(['A', 'B', 'C'], ['A', 'B', 'C']), 0)
})

test('scorePrediction sums how many places off each pick was', () => {
  // A predicted 1st, actually 3rd (off by 2); B predicted 2nd, actually 1st (off by 1);
  // C predicted 3rd, actually 2nd (off by 1). Total 4.
  assert.equal(scorePrediction(['A', 'B', 'C'], ['B', 'C', 'A']), 4)
})

test('scorePrediction skips names missing from either list rather than penalising', () => {
  // 'D' isn't in the standings snapshot yet - only A/B/C are scored.
  assert.equal(scorePrediction(['A', 'B', 'C', 'D'], ['A', 'B', 'C']), 0)
})

test('scorePrediction is null with no comparable names or empty input', () => {
  assert.equal(scorePrediction([], ['A']), null)
  assert.equal(scorePrediction(['A'], []), null)
  assert.equal(scorePrediction(['X'], ['A', 'B']), null)
})

test('rankPredictions ranks lowest score first and names entries', () => {
  const entries = [
    { userId: 'u1', predictedOrder: ['A', 'B', 'C'] }, // perfect -> 0
    { userId: 'u2', predictedOrder: ['C', 'B', 'A'] } // worst -> 4
  ]
  const ranked = rankPredictions(entries, ['A', 'B', 'C'], { u1: 'Ace', u2: 'Bee' })
  assert.equal(ranked.length, 2)
  assert.equal(ranked[0].userId, 'u1')
  assert.equal(ranked[0].score, 0)
  assert.equal(ranked[0].name, 'Ace')
  assert.equal(ranked[1].score, 4)
})

test('rankPredictions drops entries with nothing comparable to the standings', () => {
  const entries = [{ userId: 'u1', predictedOrder: ['X', 'Y'] }]
  assert.deepEqual(rankPredictions(entries, ['A', 'B'], {}), [])
})
