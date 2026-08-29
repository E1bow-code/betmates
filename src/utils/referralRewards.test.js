import { test } from 'node:test'
import assert from 'node:assert/strict'
import { REFERRAL_TIERS, referralRewardState, topReferralTier } from './referralRewards.js'

test('referralRewardState with no referrals: nothing earned, First mate is next', () => {
  const s = referralRewardState(0)
  assert.equal(s.count, 0)
  assert.deepEqual(s.earned, [])
  assert.equal(s.next.label, 'First mate')
  assert.equal(s.toNext, 1)
})

test('referralRewardState treats a null/loading count as 0', () => {
  const s = referralRewardState(null)
  assert.equal(s.count, 0)
  assert.deepEqual(s.earned, [])
  assert.equal(s.next.label, 'First mate')
  assert.equal(s.toNext, 1)
})

test('referralRewardState reports earned tiers, the next one, and the gap', () => {
  const s = referralRewardState(5)
  assert.deepEqual(s.earned.map((t) => t.label), ['First mate', 'Connector', 'Ringleader'])
  assert.equal(s.next.label, 'Kingpin')
  assert.equal(s.toNext, 5) // 10 - 5
})

test('referralRewardState at the top tier has no next and zero to-go', () => {
  const s = referralRewardState(10)
  assert.equal(s.earned.length, REFERRAL_TIERS.length)
  assert.equal(s.next, null)
  assert.equal(s.toNext, 0)
})

test('a count between tiers earns only the tiers at or below it', () => {
  // 4 clears 1 and 3 but not 5.
  assert.deepEqual(referralRewardState(4).earned.map((t) => t.label), ['First mate', 'Connector'])
})

test('topReferralTier returns the single highest earned tier, or null', () => {
  assert.equal(topReferralTier(0), null)
  assert.equal(topReferralTier(4).label, 'Connector')
  assert.equal(topReferralTier(10).label, 'Kingpin')
})
