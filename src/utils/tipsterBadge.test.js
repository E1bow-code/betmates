import test from 'node:test'
import assert from 'node:assert/strict'
import { tipsterBadge } from './tipsterBadge.js'

test('tipsterBadge awards Sharp Bettor at 20+ decided and 55%+ win rate', () => {
  assert.deepEqual(tipsterBadge({ decidedCount: 20, winRate: 55 }), { icon: '🎯', label: 'Sharp Bettor' })
})

test('tipsterBadge awards Reliable Tipster at 10+ decided and 50%+ win rate, below Sharp Bettor', () => {
  assert.deepEqual(tipsterBadge({ decidedCount: 10, winRate: 50 }), { icon: '✅', label: 'Reliable Tipster' })
  assert.deepEqual(tipsterBadge({ decidedCount: 19, winRate: 90 }), { icon: '✅', label: 'Reliable Tipster' })
})

test('tipsterBadge is null below both thresholds or with too small a sample', () => {
  assert.equal(tipsterBadge({ decidedCount: 9, winRate: 100 }), null)
  assert.equal(tipsterBadge({ decidedCount: 20, winRate: 49 }), null)
})

test('tipsterBadge is null with no stats or nothing decided yet', () => {
  assert.equal(tipsterBadge(null), null)
  assert.equal(tipsterBadge({ decidedCount: 0, winRate: null }), null)
})
