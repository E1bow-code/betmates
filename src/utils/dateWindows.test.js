import test from 'node:test'
import assert from 'node:assert/strict'
import { isWithinPeriod, formatPeriod } from './dateWindows.js'

test('isWithinPeriod matches a date inside the given calendar month', () => {
  assert.equal(isWithinPeriod('2026-07-15T12:00:00Z', '2026-07'), true)
  assert.equal(isWithinPeriod('2026-07-01T00:00:00Z', '2026-07'), true)
  assert.equal(isWithinPeriod('2026-07-31T23:59:59Z', '2026-07'), true)
})

test('isWithinPeriod rejects a date outside the given calendar month', () => {
  assert.equal(isWithinPeriod('2026-08-01T00:00:00Z', '2026-07'), false)
  assert.equal(isWithinPeriod('2026-06-30T23:59:59Z', '2026-07'), false)
})

test('isWithinPeriod is false without a date', () => {
  assert.equal(isWithinPeriod(null, '2026-07'), false)
  assert.equal(isWithinPeriod(undefined, '2026-07'), false)
})

test('formatPeriod reads a YYYY-MM period as a month and year', () => {
  assert.equal(formatPeriod('2026-07'), 'July 2026')
  assert.equal(formatPeriod('2026-01'), 'January 2026')
  assert.equal(formatPeriod('2026-12'), 'December 2026')
})
