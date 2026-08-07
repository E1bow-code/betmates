import test from 'node:test'
import assert from 'node:assert/strict'
import { findOnThisDayEntries } from './onThisDay.js'

const NOW = new Date('2026-08-07T18:00:00Z')

test('findOnThisDayEntries matches same month/day in an earlier year', () => {
  const entries = [
    { id: 'a', createdAt: '2025-08-07T09:00:00Z' }, // match - a year ago
    { id: 'b', createdAt: '2024-08-07T09:00:00Z' }, // match - two years ago
    { id: 'c', createdAt: '2025-08-08T09:00:00Z' }, // no match - wrong day
    { id: 'd', createdAt: '2025-07-07T09:00:00Z' }, // no match - wrong month
    { id: 'e', createdAt: '2026-08-07T09:00:00Z' } // no match - same year, not "a previous" one
  ]
  const result = findOnThisDayEntries(entries, NOW)
  assert.deepEqual(result.map((r) => r.id), ['a', 'b']) // most recent year first
})

test('findOnThisDayEntries is safe on empty or missing input', () => {
  assert.deepEqual(findOnThisDayEntries([], NOW), [])
  assert.deepEqual(findOnThisDayEntries(null, NOW), [])
})
