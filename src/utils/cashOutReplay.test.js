import test from 'node:test'
import assert from 'node:assert/strict'
import { computeCashOutReplay } from './cashOutReplay.js'

test('computeCashOutReplay values each point at stake * placedOdds / pointOdds', () => {
  const result = computeCashOutReplay({ stake: 10, odds: 3 }, [
    { odds: 3, fetchedAt: '2026-01-01T00:00:00Z' },
    { odds: 2, fetchedAt: '2026-01-01T01:00:00Z' }
  ])
  // At the placed price, cashing out returns exactly the stake back (10*3/3).
  assert.equal(result.points[0].value, 10)
  // Price shortened from 3 to 2 - cashing out now is worth more (10*3/2).
  assert.equal(result.points[1].value, 15)
})

test('computeCashOutReplay identifies the best point', () => {
  const result = computeCashOutReplay({ stake: 10, odds: 4 }, [
    { odds: 4, fetchedAt: '2026-01-01T00:00:00Z' },
    { odds: 2, fetchedAt: '2026-01-01T02:00:00Z' },
    { odds: 3, fetchedAt: '2026-01-01T01:00:00Z' }
  ])
  assert.equal(result.best.value, 20) // 10*4/2, the shortest price seen
  assert.equal(result.best.fetchedAt, '2026-01-01T02:00:00Z')
})

test('computeCashOutReplay sorts out-of-order input by fetchedAt', () => {
  const result = computeCashOutReplay({ stake: 10, odds: 2 }, [
    { odds: 4, fetchedAt: '2026-01-01T02:00:00Z' },
    { odds: 2, fetchedAt: '2026-01-01T00:00:00Z' }
  ])
  assert.equal(result.points[0].fetchedAt, '2026-01-01T00:00:00Z')
  assert.equal(result.points[1].fetchedAt, '2026-01-01T02:00:00Z')
})

test('computeCashOutReplay returns null without a stake or placed odds', () => {
  assert.equal(computeCashOutReplay({ stake: null, odds: 2 }, [{ odds: 2, fetchedAt: '2026-01-01T00:00:00Z' }]), null)
  assert.equal(computeCashOutReplay({ stake: 10, odds: null }, [{ odds: 2, fetchedAt: '2026-01-01T00:00:00Z' }]), null)
})

test('computeCashOutReplay tolerates empty/missing snapshots', () => {
  assert.equal(computeCashOutReplay({ stake: 10, odds: 2 }, []), null)
  assert.equal(computeCashOutReplay({ stake: 10, odds: 2 }, null), null)
})

test('computeCashOutReplay ignores invalid snapshot rows', () => {
  const result = computeCashOutReplay({ stake: 10, odds: 2 }, [
    { odds: 0, fetchedAt: '2026-01-01T00:00:00Z' },
    { odds: -1, fetchedAt: '2026-01-01T01:00:00Z' },
    { odds: 2.5, fetchedAt: '2026-01-01T02:00:00Z' }
  ])
  assert.equal(result.points.length, 1)
})
