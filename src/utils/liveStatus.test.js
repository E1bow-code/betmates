import test from 'node:test'
import assert from 'node:assert/strict'
import { isLive, hasFinished } from './liveStatus.js'

test('isLive is true between kickoff and kickoff+duration', () => {
  const kickoff = new Date(Date.now() - 30 * 60000).toISOString()
  assert.equal(isLive(kickoff, 'football'), true)
})

test('isLive is false before kickoff and false once the duration has elapsed', () => {
  assert.equal(isLive(new Date(Date.now() + 60000).toISOString(), 'football'), false)
  assert.equal(isLive(new Date(Date.now() - 200 * 60000).toISOString(), 'football'), false)
})

test('hasFinished is the complement of isLive past kickoff', () => {
  const stillOn = new Date(Date.now() - 30 * 60000).toISOString()
  const wayOver = new Date(Date.now() - 200 * 60000).toISOString()
  assert.equal(hasFinished(stillOn, 'football'), false)
  assert.equal(hasFinished(wayOver, 'football'), true)
})

test('isLive and hasFinished both handle missing kickoff gracefully', () => {
  assert.equal(isLive(null, 'racing'), false)
  assert.equal(hasFinished(null, 'racing'), false)
})
