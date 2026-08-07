import test from 'node:test'
import assert from 'node:assert/strict'
import { parseSlipText } from './betSlipOcr.js'

test('parseSlipText reads decimal odds and a labelled stake', () => {
  const result = parseSlipText('Arsenal v Chelsea\nMatch Result\nOdds 2.50\nStake £10.00\nReturns £25.00')
  assert.equal(result.odds, 2.5)
  assert.equal(result.stake, 10)
})

test('parseSlipText reads fractional odds', () => {
  const result = parseSlipText('Man City to win\n5/2\nStake: £20')
  assert.equal(result.odds, 3.5)
  assert.equal(result.stake, 20)
})

test('parseSlipText falls back to a bare currency amount for stake', () => {
  const result = parseSlipText('Selection\n11/4\n£15.00')
  assert.equal(result.odds, 3.75)
  assert.equal(result.stake, 15)
})

test('parseSlipText does not mistake a stake for the odds', () => {
  const result = parseSlipText('Some selection\n£10.00 stake')
  assert.equal(result.odds, null)
  assert.equal(result.stake, 10)
})

test('parseSlipText is safe on empty or unrecognisable input', () => {
  assert.deepEqual(parseSlipText(''), { odds: null, stake: null, lines: [] })
  assert.deepEqual(parseSlipText(null), { odds: null, stake: null, lines: [] })
  const result = parseSlipText('just some random text with no numbers')
  assert.equal(result.odds, null)
  assert.equal(result.stake, null)
})
