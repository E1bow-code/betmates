import test from 'node:test'
import assert from 'node:assert/strict'
import { detectBigStake } from './bigStake.js'

const entry = (stake) => ({ stake })

test('detectBigStake flags a stake more than 3x the average of past stakes', () => {
  const entries = [entry(10), entry(10), entry(10)]
  const result = detectBigStake(entries, 31)
  assert.deepEqual(result, { avgStake: 10, candidateStake: 31, multiple: 3.1 })
})

test('detectBigStake ignores a stake at or below 3x the average', () => {
  const entries = [entry(10), entry(10), entry(10)]
  assert.equal(detectBigStake(entries, 30), null) // exactly 3x - not over the line
  assert.equal(detectBigStake(entries, 10), null)
})

test('detectBigStake requires at least 3 prior staked entries', () => {
  const entries = [entry(10), entry(10)]
  assert.equal(detectBigStake(entries, 100), null)
})

test('detectBigStake ignores entries with no stake set', () => {
  const entries = [entry(10), entry(10), entry(null), entry(undefined)]
  assert.equal(detectBigStake(entries, 100), null) // still only 2 real staked entries
})

test('detectBigStake is safe on empty/missing input and no candidate stake', () => {
  assert.equal(detectBigStake([], 20), null)
  assert.equal(detectBigStake(null, 20), null)
  assert.equal(detectBigStake([entry(10), entry(10), entry(10)], null), null)
  assert.equal(detectBigStake([entry(10), entry(10), entry(10)], 0), null)
})
