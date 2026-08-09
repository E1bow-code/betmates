import test from 'node:test'
import assert from 'node:assert/strict'
import { kellyStake } from './kelly.js'

test('kellyStake suggests a stake proportional to the edge at full Kelly', () => {
  const result = kellyStake({ bankroll: 1000, odds: 2.5, probability: 0.5 })
  assert.equal(result.stake, 166.67)
  assert.equal(result.edgePct, 16.7)
})

test('kellyStake scales down with a fractional multiplier (e.g. quarter Kelly)', () => {
  const result = kellyStake({ bankroll: 1000, odds: 2.5, probability: 0.5, fraction: 0.25 })
  assert.equal(result.stake, 41.67)
})

test('kellyStake suggests zero, not a negative stake, when the price is worse than the estimate', () => {
  const result = kellyStake({ bankroll: 1000, odds: 2, probability: 0.3 })
  assert.equal(result.stake, 0)
  assert.equal(result.stakeFraction, 0)
  assert.ok(result.edgePct < 0)
})

test('kellyStake returns null for invalid inputs', () => {
  assert.equal(kellyStake({ bankroll: 0, odds: 2, probability: 0.5 }), null)
  assert.equal(kellyStake({ bankroll: 1000, odds: 1, probability: 0.5 }), null)
  assert.equal(kellyStake({ bankroll: 1000, odds: 2, probability: 0 }), null)
  assert.equal(kellyStake({ bankroll: 1000, odds: 2, probability: 1 }), null)
  assert.equal(kellyStake({ bankroll: 1000, odds: 2, probability: 0.5, fraction: 0 }), null)
})
