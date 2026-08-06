import test from 'node:test'
import assert from 'node:assert/strict'
import { cacheGet, cacheSet } from './apiCache.js'

test('a value round-trips within its ttl', () => {
  cacheSet('rt', { a: 1 }, 60_000)
  assert.deepEqual(cacheGet('rt'), { a: 1 })
})

test('an expired value is a miss', () => {
  cacheSet('exp', 'stale', -1)
  assert.equal(cacheGet('exp'), undefined)
})

test('an unknown key is a miss', () => {
  assert.equal(cacheGet('nope'), undefined)
})

test('writing sweeps entries that expired without being re-read', () => {
  // The leak this guards: nothing ever reads these again, so before the
  // sweep they sat in a warm instance for its whole life.
  for (let i = 0; i < 20; i++) cacheSet(`dead-${i}`, 'x', -1)
  cacheSet('live', 'y', 60_000)
  for (let i = 0; i < 20; i++) assert.equal(cacheGet(`dead-${i}`), undefined)
  assert.equal(cacheGet('live'), 'y')
})

test('the entry cap evicts oldest-first', () => {
  for (let i = 0; i < 260; i++) cacheSet(`cap-${i}`, i, 60_000)
  assert.equal(cacheGet('cap-0'), undefined, 'oldest should have been evicted')
  assert.equal(cacheGet('cap-259'), 259, 'newest should survive')
})

test('re-writing a key refreshes its place in the eviction order', () => {
  cacheSet('old', 'v', 60_000)
  for (let i = 0; i < 150; i++) cacheSet(`fill-${i}`, i, 60_000)
  cacheSet('old', 'v2', 60_000)
  for (let i = 150; i < 260; i++) cacheSet(`fill-${i}`, i, 60_000)
  assert.equal(cacheGet('old'), 'v2', 're-written key should not evict on its original position')
})
