import test from 'node:test'
import assert from 'node:assert/strict'
import { toFractional, formatOdds, parseOddsInput } from './oddsFormat.js'

test('decimal prices convert to their exact fraction', () => {
  assert.equal(toFractional(2), '1/1')
  assert.equal(toFractional(3.5), '5/2')
  assert.equal(toFractional(2.05), '21/20')
  assert.equal(toFractional(1), '-')
})

test('formatOdds prefers a native fraction over a re-derived one', () => {
  assert.equal(formatOdds(3.5, 'fractional', '5/2'), '5/2')
  assert.equal(formatOdds(3.5, 'fractional'), '5/2')
  assert.equal(formatOdds(3.5, 'decimal'), '3.50')
  assert.equal(formatOdds(null, 'decimal'), '-')
})

test('parseOddsInput accepts both notations', () => {
  assert.equal(parseOddsInput('2.05'), 2.05)
  assert.equal(parseOddsInput('  3.5 '), 3.5)
  assert.equal(parseOddsInput('5/2'), 3.5)
  assert.equal(parseOddsInput('1/1'), 2)
})

test('parseOddsInput rejects prices that cannot exist', () => {
  // Anything at or below evens-minus-stake is a typo, and letting it through
  // shows a "payout" under the stake instead of an empty field.
  assert.equal(parseOddsInput('0.5'), null)
  assert.equal(parseOddsInput('1'), null)
  assert.equal(parseOddsInput('-2'), null)
  assert.equal(parseOddsInput('-5/2'), null)
  assert.equal(parseOddsInput('5/0'), null)
  assert.equal(parseOddsInput('5/-2'), null)
  assert.equal(parseOddsInput('5/2/3'), null)
  assert.equal(parseOddsInput('abc'), null)
  assert.equal(parseOddsInput(''), null)
  assert.equal(parseOddsInput(null), null)
})
