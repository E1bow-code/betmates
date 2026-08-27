import { test } from 'node:test'
import assert from 'node:assert/strict'
import { suggestedStake, stakingPlanWarning } from './stakingPlan.js'

// ---- suggestedStake ----

test('suggestedStake returns null when no rule is set', () => {
  assert.equal(suggestedStake({ bankrollAmount: 1000, stakingRule: null }), null)
  assert.equal(suggestedStake({}), null)
})

test('suggestedStake returns the flat value for a flat rule', () => {
  assert.equal(suggestedStake({ stakingRule: { type: 'flat', value: 10 } }), 10)
})

test('suggestedStake takes a rounded percentage of bankroll for a percent rule', () => {
  assert.equal(suggestedStake({ bankrollAmount: 1000, stakingRule: { type: 'percent', value: 2 } }), 20)
  // rounds to 2dp: 1% of 33.33 = 0.3333 -> 0.33
  assert.equal(suggestedStake({ bankrollAmount: 33.33, stakingRule: { type: 'percent', value: 1 } }), 0.33)
})

test('suggestedStake returns null for a percent rule with no bankroll to take a % of', () => {
  assert.equal(suggestedStake({ bankrollAmount: 0, stakingRule: { type: 'percent', value: 2 } }), null)
  assert.equal(suggestedStake({ stakingRule: { type: 'percent', value: 2 } }), null)
})

test('suggestedStake returns null for an unknown rule type', () => {
  assert.equal(suggestedStake({ bankrollAmount: 1000, stakingRule: { type: 'kelly', value: 5 } }), null)
})

// ---- stakingPlanWarning ----

test('stakingPlanWarning stays quiet at or below 1.5x the suggestion', () => {
  const user = { stakingRule: { type: 'flat', value: 10 } }
  assert.equal(stakingPlanWarning(user, 10), null)
  assert.equal(stakingPlanWarning(user, 15), null) // exactly 1.5x is not flagged
})

test('stakingPlanWarning flags a stake above 1.5x the suggestion, with the over-percentage', () => {
  const user = { stakingRule: { type: 'flat', value: 10 } }
  assert.deepEqual(stakingPlanWarning(user, 20), { suggestion: 10, stakeNum: 20, overPct: 100 })
  assert.deepEqual(stakingPlanWarning(user, 16), { suggestion: 10, stakeNum: 16, overPct: 60 })
})

test('stakingPlanWarning returns null with no suggestion or no stake to compare', () => {
  assert.equal(stakingPlanWarning({ stakingRule: null }, 100), null)
  assert.equal(stakingPlanWarning({ stakingRule: { type: 'flat', value: 10 } }, 0), null)
})
