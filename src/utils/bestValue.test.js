import test from 'node:test'
import assert from 'node:assert/strict'
import { computeBestValue } from './bestValue.js'

const odds = (...decimals) => decimals.map((decimal, i) => ({ bookmaker: `B${i}`, decimal }))

test('computeBestValue surfaces a real edge: best price vs the market average', () => {
  // decimals 2.0, 2.0, 2.5 -> avg 2.1667, best 2.5
  const value = computeBestValue(odds(2.0, 2.0, 2.5))
  assert.equal(value.best, 2.5)
  assert.equal(value.count, 3)
  assert.ok(Math.abs(value.avg - 2.16667) < 1e-4)
  // Extra on £10 = (best - avg) * 10 = ~3.33
  assert.ok(Math.abs(value.extraPer10 - 3.3333) < 1e-3)
  assert.ok(Math.abs(value.pct - 15.3846) < 1e-3)
})

test('computeBestValue returns null below the minimum number of bookies', () => {
  // Only 2 prices - an "average" of two isn't meaningful enough to badge.
  assert.equal(computeBestValue(odds(2.0, 2.6)), null)
})

test('computeBestValue returns null when the market is too tight to matter', () => {
  // Three prices but everyone's within a hair: extra per £10 < 5p, so no badge.
  assert.equal(computeBestValue(odds(2.0, 2.0, 2.002)), null)
})

test('computeBestValue ignores non-finite and non-positive prices', () => {
  // The 0, NaN and -1 are dropped, leaving the same 2.0/2.0/2.5 edge as above.
  const value = computeBestValue([...odds(2.0, 2.0, 2.5), { decimal: 0 }, { decimal: NaN }, { decimal: -1 }])
  assert.equal(value.best, 2.5)
  assert.equal(value.count, 3)
})

test('computeBestValue tolerates empty/missing input', () => {
  assert.equal(computeBestValue([]), null)
  assert.equal(computeBestValue(undefined), null)
})
