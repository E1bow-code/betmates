import test from 'node:test'
import assert from 'node:assert/strict'
import { computeDisciplineStreak } from './discipline.js'

const entry = (over) => ({ stake: 10, status: 'lost', settledAt: '2026-08-01T12:00:00Z', ...over })

test('computeDisciplineStreak counts every settled bet when nothing was ever chased', () => {
  const entries = [
    entry({ stake: 10, status: 'won', settledAt: '2026-08-01T12:00:00Z' }),
    entry({ stake: 10, status: 'won', settledAt: '2026-08-02T12:00:00Z' }),
    entry({ stake: 10, status: 'lost', settledAt: '2026-08-03T12:00:00Z' })
  ]
  assert.equal(computeDisciplineStreak(entries), 3)
})

test('computeDisciplineStreak resets at the most recent chase, counting only what came after', () => {
  const entries = [
    entry({ stake: 10, status: 'lost', settledAt: '2026-08-01T12:00:00Z' }),
    entry({ stake: 20, status: 'lost', settledAt: '2026-08-02T12:00:00Z' }), // chased the first loss (2x)
    entry({ stake: 10, status: 'won', settledAt: '2026-08-03T12:00:00Z' }),
    entry({ stake: 10, status: 'won', settledAt: '2026-08-04T12:00:00Z' })
  ]
  assert.equal(computeDisciplineStreak(entries), 2)
})

test('computeDisciplineStreak is 0 when the very last bet was a chase', () => {
  const entries = [
    entry({ stake: 10, status: 'lost', settledAt: '2026-08-01T12:00:00Z' }),
    entry({ stake: 30, status: 'lost', settledAt: '2026-08-02T12:00:00Z' })
  ]
  assert.equal(computeDisciplineStreak(entries), 0)
})

test('computeDisciplineStreak ignores open and unstaked entries', () => {
  const entries = [
    entry({ stake: 10, status: 'won', settledAt: '2026-08-01T12:00:00Z' }),
    { stake: 10, status: 'open', settledAt: null },
    { stake: null, status: 'won', settledAt: '2026-08-02T12:00:00Z' }
  ]
  assert.equal(computeDisciplineStreak(entries), 1)
})

test('computeDisciplineStreak is 0 on empty input', () => {
  assert.equal(computeDisciplineStreak([]), 0)
  assert.equal(computeDisciplineStreak(null), 0)
})
