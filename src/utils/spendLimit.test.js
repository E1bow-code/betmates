import test from 'node:test'
import assert from 'node:assert/strict'
import { sumStakesSince, wouldExceedLimit } from './spendLimit.js'

test('sumStakesSince adds staked entries on or after the cutoff, ignoring earlier and stakeless ones', () => {
  const since = new Date('2026-03-01T00:00:00Z')
  const entries = [
    { stake: 10, createdAt: '2026-03-05T12:00:00Z' }, // in
    { stake: 5, createdAt: '2026-03-01T00:00:00Z' }, // in (boundary)
    { stake: 20, createdAt: '2026-02-27T12:00:00Z' }, // before cutoff
    { stake: null, createdAt: '2026-03-10T12:00:00Z' }, // no stake
    { createdAt: '2026-03-10T12:00:00Z' } // no stake field
  ]
  assert.equal(sumStakesSince(entries, since), 15)
})

test('wouldExceedLimit is true only when a positive stake pushes spend past a set limit', () => {
  assert.equal(wouldExceedLimit({ periodSpend: 90, stake: 20, amount: 100 }), true) // 110 > 100
  assert.equal(wouldExceedLimit({ periodSpend: 80, stake: 20, amount: 100 }), false) // 100 is not over
  assert.equal(wouldExceedLimit({ periodSpend: 0, stake: 5, amount: 100 }), false)
})

test('wouldExceedLimit never blocks when the inputs are missing or nonsensical', () => {
  assert.equal(wouldExceedLimit({ periodSpend: 200, stake: 50, amount: 0 }), false) // no limit set
  assert.equal(wouldExceedLimit({ periodSpend: 200, stake: 50, amount: null }), false)
  assert.equal(wouldExceedLimit({ periodSpend: null, stake: 50, amount: 100 }), false) // spend still loading
  assert.equal(wouldExceedLimit({ periodSpend: 200, stake: 0, amount: 100 }), false) // no stake entered
  assert.equal(wouldExceedLimit({ periodSpend: 200, stake: 'x', amount: 100 }), false)
})
