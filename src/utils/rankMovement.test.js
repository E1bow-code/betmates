import test from 'node:test'
import assert from 'node:assert/strict'
import { rankDeltas } from './rankMovement.js'

const rows = [
  { userId: 'a', rank: 1 },
  { userId: 'b', rank: 2 },
  { userId: 'c', rank: 3 }
]

test('rankDeltas reports climb (+), slide (-), hold (0) and new (null)', () => {
  // a was 3rd -> now 1st (climbed 2); b held; c was 1st -> now 3rd (slid 2);
  // and a brand-new member with no prior rank is null.
  const prev = { a: 3, b: 2, c: 1 }
  const out = rankDeltas(rows, prev)
  assert.equal(out.a, 2)
  assert.equal(out.b, 0)
  assert.equal(out.c, -2)
})

test('rankDeltas is null for a member absent from the snapshot', () => {
  const out = rankDeltas(rows, { a: 1, b: 2 }) // c is new
  assert.equal(out.c, null)
})

test('rankDeltas treats a missing/!object snapshot as all-new', () => {
  assert.deepEqual(rankDeltas(rows, null), { a: null, b: null, c: null })
  assert.deepEqual(rankDeltas(rows, undefined), { a: null, b: null, c: null })
})

test('rankDeltas tolerates empty rows', () => {
  assert.deepEqual(rankDeltas([], { a: 1 }), {})
  assert.deepEqual(rankDeltas(null, { a: 1 }), {})
})
