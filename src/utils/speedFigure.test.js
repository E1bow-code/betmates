import { test } from 'node:test'
import assert from 'node:assert/strict'
import { speedFigureBar } from './speedFigure.js'

test('returns null for missing or invalid figures', () => {
  assert.equal(speedFigureBar(null, 120), null)
  assert.equal(speedFigureBar(undefined, 120), null)
  assert.equal(speedFigureBar('', 120), null)
  assert.equal(speedFigureBar(0, 120), null)
  assert.equal(speedFigureBar(-5, 120), null)
})

test('returns null when the race max is missing or zero', () => {
  assert.equal(speedFigureBar(100, 0), null)
  assert.equal(speedFigureBar(100, null), null)
})

test('the fastest horse in the race is the top tier at full width', () => {
  assert.deepEqual(speedFigureBar(120, 120), { pct: 100, tier: 'top', value: 120 })
})

test('ties at the max also count as top (>= not just ===)', () => {
  // Two horses on the same figure should both read "fastest".
  assert.equal(speedFigureBar(120, 120).tier, 'top')
})

test('tiers step down with relative pace', () => {
  assert.equal(speedFigureBar(108, 120).tier, 'high') // 90%
  assert.equal(speedFigureBar(84, 120).tier, 'mid') //  70%
  assert.equal(speedFigureBar(48, 120).tier, 'low') //  40%
})

test('coerces numeric strings (the racing API returns figures as strings)', () => {
  assert.deepEqual(speedFigureBar('96', '120'), { pct: 80, tier: 'mid', value: 96 })
})

test('never returns a bar narrower than the 6% floor', () => {
  // A very slow horse relative to a fast winner still shows a visible stub.
  assert.equal(speedFigureBar(4, 200).pct, 6)
})

test('clamps above the max defensively (should not exceed 100%)', () => {
  assert.equal(speedFigureBar(130, 120).pct, 100)
})
