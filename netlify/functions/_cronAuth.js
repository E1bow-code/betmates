// @ts-check
// Shared gate for the scheduled (cron) functions. They run on the service-role
// key, so if they can be reached over HTTP an unauthenticated caller could
// force pushes/emails or re-run season-rollover. This lets each cron reject
// calls that are neither a genuine Netlify scheduled invocation nor carrying a
// shared secret.
//
// Ships DORMANT: with CRON_SECRET unset (the default) it allows everything,
// exactly as before — so merging changes nothing until you opt in by setting
// CRON_SECRET in the Netlify environment. Once it's set, a request is allowed
// only if it is a genuine scheduled invocation OR carries the secret, and is
// otherwise refused with 403.
//
// A real Netlify scheduled invocation is identified by the `X-NF-Event:
// schedule` header (user-agent "Netlify Clockwork"), which Netlify sends on the
// scheduler's own calls — so enabling this can never break the crons. (Netlify
// also does not expose scheduled functions at a public URL for published
// deploys, so in practice the HTTP-abuse surface may already be closed; this is
// belt-and-braces plus a gate for any manual/HTTP invocation path.)

/**
 * Gate a scheduled function. Returns a 403 Response to return immediately, or
 * null if the request may proceed.
 * @param {Request} req
 * @returns {Response | null}
 */
export function denyUnlessCron(req) {
  const secret = process.env.CRON_SECRET
  if (!secret) return null // dormant until CRON_SECRET is set

  // Genuine Netlify scheduled invocation — always allowed.
  if ((req.headers.get('x-nf-event') || '').toLowerCase() === 'schedule') return null

  // Otherwise require the shared secret (header preferred; query param for
  // convenience when invoking by hand).
  let provided = req.headers.get('x-cron-secret')
  if (!provided) {
    try {
      provided = new URL(req.url).searchParams.get('cron_secret')
    } catch {
      provided = null
    }
  }
  if (provided && provided === secret) return null

  return new Response(JSON.stringify({ ok: false, error: 'forbidden' }), {
    status: 403,
    headers: { 'content-type': 'application/json' }
  })
}
