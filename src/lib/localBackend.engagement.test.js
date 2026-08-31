import test from 'node:test'
import assert from 'node:assert/strict'

// The no-backend path (localBackend) drives the app whenever VITE_SUPABASE_* is
// unset, and CLAUDE.md warns it breaks silently if a data op is added on one
// side only. These cover the engagement ops (comments + reactions) end to end
// against a minimal in-memory localStorage shim. The shim is installed before
// any test callback runs (localBackend only touches localStorage inside its
// functions, not at import), so a plain top-level import is fine.
const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear()
}

const { addComment, deleteComment, listComments, toggleReaction, listReactions } = await import('./localBackend.js')

test('addComment then listComments round-trips, and deleteComment removes it', async () => {
  store.clear()
  const a = await addComment('bet1', 'userA', 'nice one')
  await addComment('bet1', 'userB', 'on it too')
  let list = await listComments('bet1')
  assert.equal(list.length, 2)
  assert.deepEqual(
    list.map((c) => c.body),
    ['nice one', 'on it too']
  )

  await deleteComment(a.id)
  list = await listComments('bet1')
  assert.equal(list.length, 1)
  assert.equal(list[0].body, 'on it too')
})

test('listComments is scoped to one bet', async () => {
  store.clear()
  await addComment('bet1', 'userA', 'here')
  await addComment('bet2', 'userA', 'there')
  assert.equal((await listComments('bet1')).length, 1)
  assert.equal((await listComments('bet2')).length, 1)
})

test('deleteComment on an unknown id is a harmless no-op', async () => {
  store.clear()
  await addComment('bet1', 'userA', 'still here')
  await deleteComment('does-not-exist')
  assert.equal((await listComments('bet1')).length, 1)
})

test('toggleReaction adds then removes the same emoji (idempotent toggle)', async () => {
  store.clear()
  const first = await toggleReaction('bet1', 'userA', '🔥')
  assert.equal(first.action, 'added')
  assert.equal((await listReactions('bet1')).length, 1)

  const second = await toggleReaction('bet1', 'userA', '🔥')
  assert.equal(second.action, 'removed')
  assert.equal((await listReactions('bet1')).length, 0)
})

test('toggleReaction keeps different users and different emoji distinct', async () => {
  store.clear()
  await toggleReaction('bet1', 'userA', '🔥')
  await toggleReaction('bet1', 'userB', '🔥') // different user, same emoji
  await toggleReaction('bet1', 'userA', '👍') // same user, different emoji
  const list = await listReactions('bet1')
  assert.equal(list.length, 3)
})
