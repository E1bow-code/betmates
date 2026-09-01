import { test } from 'node:test'
import assert from 'node:assert/strict'
import { settleSocialPost, settleIdeaProposal } from './proposalActions.js'

// A tiny chainable stub standing in for the supabase client: it serves one row
// for select().maybeSingle() and records every update() payload so a test can
// assert what was written.
function fakeSupabase(initialRow) {
  const updates = []
  let row = initialRow ? { ...initialRow } : null
  const api = {
    from: () => api,
    select: () => api,
    eq: () => api,
    maybeSingle: () => Promise.resolve({ data: row }),
    update(obj) {
      updates.push(obj)
      if (row) row = { ...row, ...obj }
      return { eq: () => Promise.resolve({ error: null }) }
    }
  }
  return { api, updates }
}

test('social reject marks the row rejected', async () => {
  const db = fakeSupabase({ id: 's1', body: 'hi', status: 'pending' })
  const r = await settleSocialPost(db.api, { id: 's1', action: 'reject', who: 'Bow', postToX: async () => ({}) })
  assert.equal(r.status, 'rejected')
  assert.match(r.message, /Rejected by Bow/)
  assert.equal(db.updates[0].status, 'rejected')
})

test('social approve with X not configured stops at approved', async () => {
  const db = fakeSupabase({ id: 's1', body: 'hi', status: 'pending' })
  const r = await settleSocialPost(db.api, { id: 's1', action: 'approve', postToX: async () => ({ skipped: true }) })
  assert.equal(r.status, 'approved')
  assert.match(r.message, /X not configured/)
  assert.deepEqual(db.updates.map((u) => u.status), ['approved'])
})

test('social approve that posts to X records posted + link', async () => {
  const db = fakeSupabase({ id: 's1', body: 'hi', status: 'pending' })
  const r = await settleSocialPost(db.api, { id: 's1', action: 'approve', postToX: async () => ({ ok: true, id: '42' }) })
  assert.equal(r.status, 'posted')
  assert.equal(r.link, 'https://x.com/i/status/42')
  assert.equal(db.updates[1].status, 'posted')
  assert.equal(db.updates[1].external_id, '42')
})

test('social approve where X fails records failed + error', async () => {
  const db = fakeSupabase({ id: 's1', body: 'hi', status: 'pending' })
  const r = await settleSocialPost(db.api, { id: 's1', action: 'approve', postToX: async () => ({ ok: false, status: 401, error: 'nope' }) })
  assert.equal(r.status, 'failed')
  assert.match(r.message, /X post failed: nope/)
  assert.equal(db.updates[1].status, 'failed')
})

test('social action on a non-pending row is idempotent', async () => {
  const db = fakeSupabase({ id: 's1', body: 'hi', status: 'posted' })
  const r = await settleSocialPost(db.api, { id: 's1', action: 'approve', postToX: async () => ({ ok: true }) })
  assert.equal(r.ok, false)
  assert.match(r.message, /Already posted/)
  assert.equal(db.updates.length, 0)
})

test('social action on a missing row reports gone', async () => {
  const db = fakeSupabase(null)
  const r = await settleSocialPost(db.api, { id: 's1', action: 'reject', postToX: async () => ({}) })
  assert.equal(r.ok, false)
  assert.match(r.message, /no longer exists/)
})

test('idea reject marks the row rejected with the actor', async () => {
  const db = fakeSupabase({ id: 'i1', body: 'idea', sources: [], status: 'pending' })
  const r = await settleIdeaProposal(db.api, { id: 'i1', action: 'reject', who: 'Bow', openIssue: async () => null })
  assert.equal(r.status, 'rejected')
  assert.equal(db.updates[0].decided_by, 'Bow')
})

test('idea approve that opens an issue records the url', async () => {
  const db = fakeSupabase({ id: 'i1', body: 'idea', sources: [], status: 'pending' })
  const r = await settleIdeaProposal(db.api, { id: 'i1', action: 'approve', openIssue: async () => 'https://github.com/x/y/issues/3' })
  assert.equal(r.status, 'approved')
  assert.equal(r.link, 'https://github.com/x/y/issues/3')
  assert.equal(db.updates[1].issue_url, 'https://github.com/x/y/issues/3')
})

test('idea approve with GitHub unconfigured just saves it', async () => {
  const db = fakeSupabase({ id: 'i1', body: 'idea', sources: [], status: 'pending' })
  const r = await settleIdeaProposal(db.api, { id: 'i1', action: 'approve', openIssue: async () => null })
  assert.equal(r.status, 'approved')
  assert.match(r.message, /Idea saved/)
  assert.equal(db.updates.length, 1)
})
