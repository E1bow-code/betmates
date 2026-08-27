import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getEachWayTerms, computeEachWayReturn } from './eachWay.js'

// ---- getEachWayTerms: standard UK terms by field size ----

test('getEachWayTerms returns the right terms for each field-size tier', () => {
  assert.deepEqual(getEachWayTerms(16), { places: 4, fraction: 0.25 })
  assert.deepEqual(getEachWayTerms(20), { places: 4, fraction: 0.25 })
  assert.deepEqual(getEachWayTerms(12), { places: 3, fraction: 0.25 })
  assert.deepEqual(getEachWayTerms(15), { places: 3, fraction: 0.25 })
  assert.deepEqual(getEachWayTerms(8), { places: 3, fraction: 0.2 })
  assert.deepEqual(getEachWayTerms(11), { places: 3, fraction: 0.2 })
  assert.deepEqual(getEachWayTerms(5), { places: 2, fraction: 0.25 })
  assert.deepEqual(getEachWayTerms(7), { places: 2, fraction: 0.25 })
})

test('getEachWayTerms tier boundaries land on the tier they open', () => {
  // A value sitting exactly on a boundary belongs to the higher tier.
  assert.equal(getEachWayTerms(16).places, 4)
  assert.equal(getEachWayTerms(12).places, 3)
  assert.equal(getEachWayTerms(12).fraction, 0.25)
  assert.equal(getEachWayTerms(8).fraction, 0.2) // 8-11 pays 1/5, not 1/4
})

test('getEachWayTerms returns null under 5 runners (each-way not offered)', () => {
  assert.equal(getEachWayTerms(4), null)
  assert.equal(getEachWayTerms(1), null)
  assert.equal(getEachWayTerms(0), null)
})

// ---- computeEachWayReturn ----
// Worked example: stake 10 (so each half is 5), odds 5.0, fraction 0.25.
//   placeOdds = 1 + (5 - 1) * 0.25 = 2.0
//   win   = 5 * 5.0 + 5 * 2.0 = 25 + 10 = 35
//   place = 5 * 2.0            = 10
//   lose  = 0
const TERMS = { places: 3, fraction: 0.25 }

test('computeEachWayReturn on a win pays both the win and place parts', () => {
  assert.equal(computeEachWayReturn(10, 5.0, TERMS, 'win'), 35)
})

test('computeEachWayReturn on a place pays only the place half', () => {
  assert.equal(computeEachWayReturn(10, 5.0, TERMS, 'place'), 10)
})

test('computeEachWayReturn on a loss returns nothing', () => {
  assert.equal(computeEachWayReturn(10, 5.0, TERMS, 'lose'), 0)
})

test('computeEachWayReturn shortens the place odds by the terms fraction', () => {
  // 1/5 terms (the 8-11 runner tier): placeOdds = 1 + (6 - 1) * 0.2 = 2.0
  const terms = { places: 3, fraction: 0.2 }
  assert.equal(computeEachWayReturn(20, 6.0, terms, 'place'), 20) // half 10 * 2.0
  assert.equal(computeEachWayReturn(20, 6.0, terms, 'win'), 80) // 10*6.0 + 10*2.0
})

test('computeEachWayReturn treats an unrecognised result as no return', () => {
  assert.equal(computeEachWayReturn(10, 5.0, TERMS, 'void'), 0)
})
