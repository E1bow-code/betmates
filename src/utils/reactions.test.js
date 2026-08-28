import test from 'node:test'
import assert from 'node:assert/strict'
import { summariseReactions } from './reactions.js'

const EMOJIS = ['🔥', '👍', '😂']

test('summariseReactions counts each emoji and flags the current user', () => {
  const rows = [
    { emoji: '🔥', userId: 'a' },
    { emoji: '🔥', userId: 'b' },
    { emoji: '👍', userId: 'a' }
  ]
  const out = summariseReactions(rows, EMOJIS, 'a')
  const fire = out.find((s) => s.emoji === '🔥')
  const thumb = out.find((s) => s.emoji === '👍')
  const laugh = out.find((s) => s.emoji === '😂')
  assert.equal(fire.count, 2)
  assert.equal(fire.mine, true) // 'a' reacted with fire
  assert.deepEqual(fire.userIds, ['a', 'b'])
  assert.equal(thumb.count, 1)
  assert.equal(thumb.mine, true)
  assert.equal(laugh.count, 0)
  assert.equal(laugh.mine, false)
  assert.deepEqual(laugh.userIds, [])
})

test('summariseReactions returns an entry for every emoji, in order', () => {
  const out = summariseReactions([], EMOJIS, 'a')
  assert.deepEqual(out.map((s) => s.emoji), EMOJIS)
  assert.ok(out.every((s) => s.count === 0 && s.mine === false))
})

test('summariseReactions ignores reactions under an unknown emoji', () => {
  const rows = [
    { emoji: '💰', userId: 'a' }, // not in EMOJIS
    { emoji: '🔥', userId: 'b' }
  ]
  const out = summariseReactions(rows, EMOJIS, 'a')
  assert.equal(out.reduce((n, s) => n + s.count, 0), 1) // only the 🔥 counts
  assert.equal(out.find((s) => s.emoji === '🔥').mine, false) // 'a' only reacted with the ignored 💰
})

test('summariseReactions tolerates null/undefined rows', () => {
  assert.deepEqual(summariseReactions(null, EMOJIS, 'a').map((s) => s.count), [0, 0, 0])
  assert.deepEqual(summariseReactions(undefined, EMOJIS, 'a').map((s) => s.count), [0, 0, 0])
})
