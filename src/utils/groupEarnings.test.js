import test from 'node:test'
import assert from 'node:assert/strict'
import { computeGroupEarnings } from './groupEarnings.js'

test('computeGroupEarnings multiplies price by subscriber count for gross MRR', () => {
  const { grossMrr } = computeGroupEarnings(3, 4.99)
  assert.equal(grossMrr, 14.97)
})

test('computeGroupEarnings takes the platform fee off the gross figure', () => {
  const { grossMrr, platformFee, netMrr } = computeGroupEarnings(10, 5)
  assert.equal(grossMrr, 50)
  assert.equal(platformFee, 5)
  assert.equal(netMrr, 45)
})

test('computeGroupEarnings honours a custom platform fee percent', () => {
  const { platformFee, netMrr } = computeGroupEarnings(4, 10, 20)
  assert.equal(platformFee, 8)
  assert.equal(netMrr, 32)
})

test('computeGroupEarnings is all zero with no paying subscribers', () => {
  assert.deepEqual(computeGroupEarnings(0, 4.99), { grossMrr: 0, platformFee: 0, netMrr: 0 })
})
