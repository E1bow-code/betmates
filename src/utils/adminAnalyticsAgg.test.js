import test from 'node:test'
import assert from 'node:assert/strict'
import { bucketByDay, distinctUsersSince } from './adminAnalyticsAgg.js'

function isoDaysAgo(days) {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString()
}

test('bucketByDay returns a dense, zero-filled array with no rows', () => {
  const buckets = bucketByDay([], 'createdAt', 30)
  assert.equal(buckets.length, 30)
  assert.ok(buckets.every((b) => b.count === 0))
})

test('bucketByDay counts a row exactly on the last day of the window', () => {
  const buckets = bucketByDay([{ createdAt: isoDaysAgo(0) }], 'createdAt', 30)
  const total = buckets.reduce((sum, b) => sum + b.count, 0)
  assert.equal(total, 1)
  assert.equal(buckets[buckets.length - 1].count, 1)
})

test('bucketByDay counts a row on the first day of the window (30 days back)', () => {
  const buckets = bucketByDay([{ createdAt: isoDaysAgo(29) }], 'createdAt', 30)
  const total = buckets.reduce((sum, b) => sum + b.count, 0)
  assert.equal(total, 1)
  assert.equal(buckets[0].count, 1)
})

test('bucketByDay excludes a row older than the window', () => {
  const buckets = bucketByDay([{ createdAt: isoDaysAgo(31) }], 'createdAt', 30)
  const total = buckets.reduce((sum, b) => sum + b.count, 0)
  assert.equal(total, 0)
})

test('distinctUsersSince counts each user once even if active in multiple source rows', () => {
  const rows = [
    { userId: 'a', at: isoDaysAgo(0) },
    { userId: 'a', at: isoDaysAgo(1) },
    { userId: 'b', at: isoDaysAgo(2) }
  ]
  const cutoff = new Date(isoDaysAgo(7))
  assert.equal(distinctUsersSince(rows, cutoff), 2)
})

test('distinctUsersSince excludes rows before the cutoff', () => {
  const rows = [
    { userId: 'a', at: isoDaysAgo(0) },
    { userId: 'b', at: isoDaysAgo(10) }
  ]
  const cutoff = new Date(isoDaysAgo(7))
  assert.equal(distinctUsersSince(rows, cutoff), 1)
})
