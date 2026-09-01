import { test } from 'node:test'
import assert from 'node:assert/strict'
import { notifyDiscord } from './discordNotify.js'

// Swap global.fetch for the duration of a test and always restore it.
async function withFetch(fake, fn) {
  const orig = global.fetch
  global.fetch = fake
  try {
    return await fn()
  } finally {
    global.fetch = orig
  }
}

test('no-op when no webhook is configured: returns false and never hits the network', async () => {
  const prev = process.env.DISCORD_WEBHOOK_URL
  delete process.env.DISCORD_WEBHOOK_URL
  let called = false
  try {
    const sent = await withFetch(async () => { called = true; return { ok: true } }, () =>
      notifyDiscord('hello')
    )
    assert.equal(sent, false)
    assert.equal(called, false)
  } finally {
    if (prev !== undefined) process.env.DISCORD_WEBHOOK_URL = prev
  }
})

test('no-op on empty content even when a webhook is set', async () => {
  let called = false
  const sent = await withFetch(async () => { called = true; return { ok: true } }, () =>
    notifyDiscord('', { webhook: 'https://discord.test/hook' })
  )
  assert.equal(sent, false)
  assert.equal(called, false)
})

test('posts a safe payload when a webhook is set', async () => {
  let captured
  const sent = await withFetch(
    async (url, init) => { captured = { url, method: init.method, body: JSON.parse(init.body) }; return { ok: true } },
    () => notifyDiscord('Dex settled 3 bets', { webhook: 'https://discord.test/hook' })
  )
  assert.equal(sent, true)
  assert.equal(captured.url, 'https://discord.test/hook')
  assert.equal(captured.method, 'POST')
  assert.equal(captured.body.content, 'Dex settled 3 bets')
  assert.equal(captured.body.username, 'BetMates HQ')
  // Automated posts must never be able to ping @everyone/@here/roles.
  assert.deepEqual(captured.body.allowed_mentions, { parse: [] })
})

test('truncates content to stay under the Discord 2000-char cap', async () => {
  let captured
  await withFetch(
    async (url, init) => { captured = JSON.parse(init.body); return { ok: true } },
    () => notifyDiscord('x'.repeat(5000), { webhook: 'https://discord.test/hook' })
  )
  assert.ok(captured.content.length <= 1900, `content length ${captured.content.length} should be <= 1900`)
})

test('swallows a network error: returns false, never throws', async () => {
  const sent = await withFetch(
    async () => { throw new Error('network down') },
    () => notifyDiscord('boom', { webhook: 'https://discord.test/hook' })
  )
  assert.equal(sent, false)
})

test('returns false on a non-2xx response', async () => {
  const sent = await withFetch(
    async () => ({ ok: false, status: 429 }),
    () => notifyDiscord('rate limited', { webhook: 'https://discord.test/hook' })
  )
  assert.equal(sent, false)
})
