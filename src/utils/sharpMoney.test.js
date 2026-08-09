import test from 'node:test'
import assert from 'node:assert/strict'
import { detectSharpMoney } from './sharpMoney.js'

const point = (odds, minsAgo) => ({ odds, fetchedAt: new Date(Date.now() - minsAgo * 60000).toISOString() })

test('detectSharpMoney flags a consistent, meaningful shortening', () => {
  const snapshots = [point(4.0, 120), point(3.6, 90), point(3.2, 60), point(3.0, 30)]
  const result = detectSharpMoney(snapshots)
  assert.ok(result)
  assert.equal(result.direction, 'shortening')
  assert.equal(result.from, 4.0)
  assert.equal(result.to, 3.0)
  assert.ok(result.pct >= 8)
})

test('detectSharpMoney flags a consistent drift the other way', () => {
  const snapshots = [point(2.0, 90), point(2.2, 60), point(2.4, 30)]
  const result = detectSharpMoney(snapshots)
  assert.ok(result)
  assert.equal(result.direction, 'drifting')
})

test('detectSharpMoney ignores small moves below the threshold', () => {
  const snapshots = [point(2.0, 90), point(2.02, 60), point(2.05, 30)]
  assert.equal(detectSharpMoney(snapshots), null)
})

test('detectSharpMoney ignores an inconsistent (whipsawing) series even if net move is large', () => {
  const snapshots = [point(2.0, 120), point(3.0, 90), point(1.5, 60), point(2.5, 30)]
  assert.equal(detectSharpMoney(snapshots), null)
})

test('detectSharpMoney requires a minimum number of snapshots', () => {
  const snapshots = [point(4.0, 60), point(3.0, 30)]
  assert.equal(detectSharpMoney(snapshots), null)
})

test('detectSharpMoney sorts out-of-order input by fetchedAt', () => {
  const snapshots = [point(3.0, 30), point(4.0, 120), point(3.6, 90), point(3.2, 60)]
  const result = detectSharpMoney(snapshots)
  assert.ok(result)
  assert.equal(result.from, 4.0)
  assert.equal(result.to, 3.0)
})

test('detectSharpMoney tolerates empty/missing input', () => {
  assert.equal(detectSharpMoney([]), null)
  assert.equal(detectSharpMoney(undefined), null)
})
