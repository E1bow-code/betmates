import test from 'node:test'
import assert from 'node:assert/strict'
import { freezesGranted, computeStreakTransition } from './dailyStreak.js'

test('freezesGranted grants one per 7 days since account creation, capped at 3', () => {
  const created = new Date('2026-01-01T00:00:00Z')
  assert.equal(freezesGranted(created, new Date('2026-01-01T00:00:00Z')), 0)
  assert.equal(freezesGranted(created, new Date('2026-01-08T00:00:00Z')), 1)
  assert.equal(freezesGranted(created, new Date('2026-01-22T00:00:00Z')), 3)
  assert.equal(freezesGranted(created, new Date('2026-06-01T00:00:00Z')), 3)
})

test('computeStreakTransition is a no-op when already logged today', () => {
  const result = computeStreakTransition({ currentCount: 4, lastLoggedDate: '2026-08-09', freezesAvailable: 0, today: '2026-08-09' })
  assert.deepEqual(result, { currentCount: 4, lastLoggedDate: '2026-08-09', freezeConsumed: false, changed: false })
})

test('computeStreakTransition extends the streak on a consecutive day', () => {
  const result = computeStreakTransition({ currentCount: 4, lastLoggedDate: '2026-08-08', freezesAvailable: 0, today: '2026-08-09' })
  assert.deepEqual(result, { currentCount: 5, lastLoggedDate: '2026-08-09', freezeConsumed: false, changed: true })
})

test('computeStreakTransition bridges a single missed day using a freeze', () => {
  const result = computeStreakTransition({ currentCount: 4, lastLoggedDate: '2026-08-07', freezesAvailable: 1, today: '2026-08-09' })
  assert.deepEqual(result, { currentCount: 5, lastLoggedDate: '2026-08-09', freezeConsumed: true, changed: true })
})

test('computeStreakTransition resets a missed day when no freeze is available', () => {
  const result = computeStreakTransition({ currentCount: 4, lastLoggedDate: '2026-08-07', freezesAvailable: 0, today: '2026-08-09' })
  assert.deepEqual(result, { currentCount: 1, lastLoggedDate: '2026-08-09', freezeConsumed: false, changed: true })
})

test('computeStreakTransition resets after a gap too large for one freeze to cover', () => {
  const result = computeStreakTransition({ currentCount: 4, lastLoggedDate: '2026-08-01', freezesAvailable: 2, today: '2026-08-09' })
  assert.deepEqual(result, { currentCount: 1, lastLoggedDate: '2026-08-09', freezeConsumed: false, changed: true })
})

test('computeStreakTransition starts a fresh streak with no prior log', () => {
  const result = computeStreakTransition({ currentCount: 0, lastLoggedDate: null, freezesAvailable: 0, today: '2026-08-09' })
  assert.deepEqual(result, { currentCount: 1, lastLoggedDate: '2026-08-09', freezeConsumed: false, changed: true })
})
