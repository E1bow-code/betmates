// Verifies a Discord interactions request's Ed25519 signature. Discord signs
// (timestamp + rawBody) with the application's private key; we verify it with
// the app's public key (DISCORD_PUBLIC_KEY) so nobody can forge button clicks
// against our endpoint. Uses Node's built-in WebCrypto (crypto.subtle) - no
// dependency - and returns false on any bad input or error rather than
// throwing, so the endpoint can answer 401 cleanly.

function hexToBytes(hex) {
  if (typeof hex !== 'string' || hex.length === 0 || hex.length % 2 !== 0) return null
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) {
    const b = parseInt(hex.substr(i * 2, 2), 16)
    if (Number.isNaN(b)) return null
    out[i] = b
  }
  return out
}

/**
 * @param {string} publicKeyHex the Discord app's public key (hex, 32 bytes)
 * @param {string} signatureHex the X-Signature-Ed25519 header value
 * @param {string} timestamp    the X-Signature-Timestamp header value
 * @param {string} rawBody      the exact raw request body string
 * @returns {Promise<boolean>} true only if the signature is valid
 */
export async function verifyDiscordRequest(publicKeyHex, signatureHex, timestamp, rawBody) {
  try {
    const pub = hexToBytes(publicKeyHex)
    const sig = hexToBytes(signatureHex)
    if (!pub || pub.length !== 32 || !sig || timestamp == null || rawBody == null) return false
    const msg = new TextEncoder().encode(String(timestamp) + String(rawBody))
    const key = await crypto.subtle.importKey('raw', pub, { name: 'Ed25519' }, false, ['verify'])
    return await crypto.subtle.verify('Ed25519', key, sig, msg)
  } catch {
    return false
  }
}
