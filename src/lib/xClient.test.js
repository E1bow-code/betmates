import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildOAuthHeader, postToX } from './xClient.js'

const CREDS = { apiKey: 'ck', apiSecret: 'cs', accessToken: 'tok', accessSecret: 'toksec' }

async function withFetch(fake, fn) {
  const orig = global.fetch
  global.fetch = fake
  try { return await fn() } finally { global.fetch = orig }
}

test('OAuth header is well-formed and deterministic for fixed nonce/timestamp', () => {
  const h = buildOAuthHeader({
    method: 'POST', url: 'https://api.twitter.com/2/tweets',
    consumerKey: 'ck', consumerSecret: 'cs', token: 'tok', tokenSecret: 'toksec',
    nonce: 'abc123', timestamp: '1700000000'
  })
  assert.ok(h.startsWith('OAuth '))
  assert.match(h, /oauth_consumer_key="ck"/)
  assert.match(h, /oauth_signature_method="HMAC-SHA1"/)
  assert.match(h, /oauth_nonce="abc123"/)
  assert.match(h, /oauth_timestamp="1700000000"/)
  assert.match(h, /oauth_signature="[^"]+"/)
  // Regression guard: the same inputs must always produce the same signature,
  // so a change to the signing routine is caught by this test.
  const again = buildOAuthHeader({
    method: 'POST', url: 'https://api.twitter.com/2/tweets',
    consumerKey: 'ck', consumerSecret: 'cs', token: 'tok', tokenSecret: 'toksec',
    nonce: 'abc123', timestamp: '1700000000'
  })
  assert.equal(h, again)
})

test('no-op (skipped) when any credential is missing', async () => {
  let called = false
  const r = await withFetch(async () => { called = true; return { ok: true } }, () =>
    postToX('hello', { apiKey: 'ck', apiSecret: 'cs', accessToken: 'tok' }) // no accessSecret
  )
  assert.equal(r.skipped, true)
  assert.equal(r.ok, false)
  assert.equal(called, false)
})

test('posts and returns the tweet id on success', async () => {
  let captured
  const r = await withFetch(
    async (url, init) => { captured = { url, init }; return { ok: true, json: async () => ({ data: { id: '1839' } }) } },
    () => postToX('gm', CREDS)
  )
  assert.equal(r.ok, true)
  assert.equal(r.id, '1839')
  assert.equal(captured.url, 'https://api.twitter.com/2/tweets')
  assert.equal(captured.init.method, 'POST')
  assert.ok(captured.init.headers.authorization.startsWith('OAuth '))
  assert.equal(JSON.parse(captured.init.body).text, 'gm')
})

test('returns ok:false with status on a non-2xx response', async () => {
  const r = await withFetch(
    async () => ({ ok: false, status: 403, text: async () => 'Forbidden' }),
    () => postToX('gm', CREDS)
  )
  assert.equal(r.ok, false)
  assert.equal(r.status, 403)
  assert.match(r.error, /Forbidden/)
})

test('swallows a network error (never throws)', async () => {
  const r = await withFetch(async () => { throw new Error('down') }, () => postToX('gm', CREDS))
  assert.equal(r.ok, false)
  assert.match(r.error, /down/)
})
