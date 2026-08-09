import test from 'node:test'
import assert from 'node:assert/strict'
import { computeXp, xpForLevel, levelForXp, xpForNextLevel, flairTierForLevel } from './xp.js'

test('computeXp sums each action at its own weight', () => {
  const xp = computeXp({ loggedCount: 1, settledCount: 1, wonCount: 1, postedCount: 1, referralCount: 1 })
  assert.equal(xp, 2 + 3 + 5 + 4 + 15)
})

test('computeXp defaults missing counts to zero', () => {
  assert.equal(computeXp({}), 0)
  assert.equal(computeXp({ loggedCount: 3 }), 6)
})

test('levelForXp and xpForLevel round-trip at level boundaries', () => {
  assert.equal(levelForXp(0), 1)
  assert.equal(xpForLevel(1), 0)
  assert.equal(levelForXp(xpForLevel(2)), 2)
  assert.equal(levelForXp(xpForLevel(5)), 5)
  // Just short of the next threshold stays at the current level.
  assert.equal(levelForXp(xpForLevel(3) - 1), 2)
})

test('xpForNextLevel is the XP needed to reach level+1', () => {
  assert.equal(xpForNextLevel(1), xpForLevel(2))
  assert.equal(xpForNextLevel(4), xpForLevel(5))
})

test('flairTierForLevel picks the highest tier reached, null below the first', () => {
  assert.equal(flairTierForLevel(1), null)
  assert.equal(flairTierForLevel(4), null)
  assert.equal(flairTierForLevel(5), 'bronze')
  assert.equal(flairTierForLevel(9), 'bronze')
  assert.equal(flairTierForLevel(10), 'silver')
  assert.equal(flairTierForLevel(20), 'gold')
  assert.equal(flairTierForLevel(35), 'diamond')
  assert.equal(flairTierForLevel(100), 'diamond')
})
