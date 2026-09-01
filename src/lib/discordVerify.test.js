import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { verifyDiscordRequest } from './discordVerify.js'

// Generate a real Ed25519 keypair and sign like Discord does, so this is a
// genuine round-trip of the verification path rather than a hardcoded vector.
function makeSigned(timestamp, body) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
  const publicKeyHex = Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url').toString('hex')
  const sig = crypto.sign(null, Buffer.from(timestamp + body), privateKey)
  return { publicKeyHex, signatureHex: sig.toString('hex') }
}

test('accepts a correctly signed request', async () => {
  const ts = '1700000000'
  const body = JSON.stringify({ type: 1 })
  const { publicKeyHex, signatureHex } = makeSigned(ts, body)
  assert.equal(await verifyDiscordRequest(publicKeyHex, signatureHex, ts, body), true)
})

test('rejects a tampered body', async () => {
  const ts = '1700000000'
  const body = JSON.stringify({ type: 1 })
  const { publicKeyHex, signatureHex } = makeSigned(ts, body)
  assert.equal(await verifyDiscordRequest(publicKeyHex, signatureHex, ts, body + ' '), false)
})

test('rejects a wrong public key', async () => {
  const ts = '1700000000'
  const body = 'x'
  const { signatureHex } = makeSigned(ts, body)
  const other = makeSigned(ts, body).publicKeyHex
  assert.equal(await verifyDiscordRequest(other, signatureHex, ts, body), false)
})

test('rejects malformed / missing inputs without throwing', async () => {
  assert.equal(await verifyDiscordRequest('nothex', 'nothex', '1', 'b'), false)
  assert.equal(await verifyDiscordRequest('', '', '', ''), false)
  assert.equal(await verifyDiscordRequest(undefined, undefined, undefined, undefined), false)
})
