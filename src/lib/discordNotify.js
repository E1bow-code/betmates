// Fire-and-forget Discord notifier for the scheduled "agents" (auto-settle,
// alert-checks, coach-settle, ...). Posts a message to the webhook in
// DISCORD_WEBHOOK_URL so the operator hears when an agent does something
// notable while nobody's signed in.
//
// Two contracts, both deliberate and matching the rest of this codebase:
//   1. NO-OP when unconfigured. If DISCORD_WEBHOOK_URL is unset it returns
//      false without touching the network - the same "missing API keys
//      degrade, they don't crash" rule the odds proxies follow, so the app
//      (and every function that calls this) runs unchanged with zero keys.
//   2. NEVER throws. A broken/slow webhook must never surface on the
//      settlement or alert flow that triggered it, so every path resolves to
//      a boolean and swallows errors - the same posture send-push.js takes by
//      always resolving 200.
//
// It lives in src/lib (not netlify/functions) so `npm test` - which only runs
// src/**/*.test.js - can cover it, exactly like betEvaluation.js. It is never
// imported by the client, so process.env / fetch here never reach the browser
// bundle; the env var is read INSIDE the call so the module stays inert if it
// is ever imported somewhere it shouldn't be.

const MAX_CONTENT = 1900 // Discord hard-caps message content at 2000; leave headroom

/**
 * Post a message to Discord via an incoming webhook.
 * @param {string} content - what to say (e.g. "Dex settled 3 bets").
 * @param {{ username?: string, embeds?: any[], webhook?: string }} [opts]
 *   webhook overrides DISCORD_WEBHOOK_URL (used by tests); username sets the
 *   display name; embeds is passed through verbatim if given.
 * @returns {Promise<boolean>} true if sent (HTTP 2xx), false if skipped
 *   (no webhook) or failed (network/HTTP error, swallowed).
 */
export async function notifyDiscord(content, opts = {}) {
  const url = opts.webhook || process.env.DISCORD_WEBHOOK_URL
  // Unconfigured, or nothing worth saying -> silent no-op (contract #1).
  if (!url || !content) return false
  try {
    /** @type {Record<string, any>} */
    const body = {
      content: String(content).slice(0, MAX_CONTENT),
      username: opts.username || 'BetMates HQ',
      // Automated posts must never be able to @everyone/@here or ping a role,
      // even if a message string happens to contain "@everyone".
      allowed_mentions: { parse: [] }
    }
    if (opts.embeds) body.embeds = opts.embeds
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })
    return res.ok
  } catch {
    // Belt-and-braces: a failed notify never breaks its caller (contract #2).
    return false
  }
}
