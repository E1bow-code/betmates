// Publishes an approved post to X (Twitter) via API v2 POST /2/tweets,
// authenticated with OAuth 1.0a user context (the app's consumer key/secret +
// the account's access token/secret). Signing is done with Node's built-in
// crypto - no new dependency.
//
// Same contracts as the rest of this codebase: NO-OP when the four X_* creds
// aren't all set (returns { skipped: true } without a network call), and NEVER
// throws (every path resolves to a result object). It lives in src/lib so
// `npm test` covers the pure signing, and the interactions endpoint imports it
// the same way functions import betEvaluation.
//
// Note on v2 + JSON body: the OAuth 1.0a signature base string for a v2 JSON
// endpoint covers only the oauth_* parameters (and any query params) - the
// JSON body is NOT signed - so this signs the empty parameter set plus the
// oauth params, which is correct for POST /2/tweets.

import crypto from 'node:crypto'

// RFC 3986 percent-encoding (encodeURIComponent leaves !*'() alone; OAuth wants them encoded).
function pct(s) {
  return encodeURIComponent(String(s)).replace(/[!*'()]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
}

/**
 * Build the OAuth 1.0a Authorization header for a request. `nonce` and
 * `timestamp` are injectable so the signature is deterministic under test.
 * @param {{ method: string, url: string, consumerKey: string, consumerSecret: string, token: string, tokenSecret: string, nonce?: string, timestamp?: string }} o
 * @returns {string}
 */
export function buildOAuthHeader(o) {
  const oauth = {
    oauth_consumer_key: o.consumerKey,
    oauth_nonce: o.nonce || crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: o.timestamp || Math.floor(Date.now() / 1000).toString(),
    oauth_token: o.token,
    oauth_version: '1.0'
  }
  const paramStr = Object.keys(oauth).sort().map((k) => `${pct(k)}=${pct(oauth[k])}`).join('&')
  const base = `${o.method.toUpperCase()}&${pct(o.url)}&${pct(paramStr)}`
  const signingKey = `${pct(o.consumerSecret)}&${pct(o.tokenSecret)}`
  const signature = crypto.createHmac('sha1', signingKey).update(base).digest('base64')
  const all = { ...oauth, oauth_signature: signature }
  return 'OAuth ' + Object.keys(all).sort().map((k) => `${pct(k)}="${pct(all[k])}"`).join(', ')
}

/**
 * Publish a tweet. Returns { ok, id?, skipped?, status?, error? }.
 * @param {string} text
 * @param {{ apiKey?: string, apiSecret?: string, accessToken?: string, accessSecret?: string }} [creds]
 * @returns {Promise<{ ok: boolean, id?: string|null, skipped?: boolean, status?: number, error?: string }>}
 */
export async function postToX(text, creds = {}) {
  const consumerKey = creds.apiKey || process.env.X_API_KEY
  const consumerSecret = creds.apiSecret || process.env.X_API_SECRET
  const token = creds.accessToken || process.env.X_ACCESS_TOKEN
  const tokenSecret = creds.accessSecret || process.env.X_ACCESS_SECRET
  if (!consumerKey || !consumerSecret || !token || !tokenSecret || !text) {
    return { ok: false, skipped: true } // not configured / nothing to post -> no-op
  }
  const url = 'https://api.twitter.com/2/tweets'
  try {
    const authorization = buildOAuthHeader({ method: 'POST', url, consumerKey, consumerSecret, token, tokenSecret })
    const res = await fetch(url, {
      method: 'POST',
      headers: { authorization, 'content-type': 'application/json' },
      body: JSON.stringify({ text })
    })
    if (!res.ok) {
      let detail = ''
      try { detail = await res.text() } catch { /* ignore body read errors */ }
      return { ok: false, status: res.status, error: detail.slice(0, 300) }
    }
    const data = await res.json().catch(() => ({}))
    return { ok: true, id: data?.data?.id ?? null }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
