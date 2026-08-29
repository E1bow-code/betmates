// @ts-check
// Client-side throttle for the error logger (dataStore.logClientError and its
// localBackend twin). A render loop or a repeated error path can otherwise call
// logClientError hundreds of times a second. The server-side rate cap (the
// error_logs insert guard in supabase/schema.sql) protects the database, but it
// still receives every wasted round-trip, and identical rows still crowd out
// distinct errors up to the cap. This stops the client generating the traffic
// at all: a REPEAT of the same error signature inside a short window is
// suppressed, while distinct errors always log immediately. A per-session count
// is a hard backstop against a pathological loop of ever-changing messages.
//
// It must never throw - a logger that errors is worse than one that drops - so
// the callers treat a `true` return as "skip this send" and otherwise proceed.

const WINDOW_MS = 60_000 // same signature within a minute -> skip the repeat
const MAX_PER_SESSION = 500 // absolute backstop for a single page session
const MAP_CAP = 200 // prune distinct-signature bookkeeping past this many

/** @typedef {{ message?: string, stack?: string|null, route?: string|null }} ClientErrorEntry */

/** @type {Map<string, number>} signature -> last-sent epoch ms */
const lastSent = new Map()
let sessionCount = 0

// A stable-ish fingerprint for an error: message + route + the top stack frame.
// The tail of a stack varies (async hops, minified frames); the first line is
// what identifies the failing site, so two calls from the same place collapse.
/** @param {ClientErrorEntry} entry @returns {string} */
export function errorSignature(entry) {
  const firstStackLine = (entry.stack || '').split('\n', 1)[0]
  return `${entry.message || ''}|${entry.route || ''}|${firstStackLine}`
}

// Returns true when this error should be SKIPPED - a recent duplicate, or over
// the per-session cap. Records the send (and prunes stale bookkeeping) when it
// returns false. `now` is injectable so the window is testable without waiting.
/** @param {ClientErrorEntry} entry @param {number} [now] @returns {boolean} */
export function shouldSkipErrorLog(entry, now = Date.now()) {
  if (sessionCount >= MAX_PER_SESSION) return true
  const sig = errorSignature(entry)
  const prev = lastSent.get(sig)
  if (prev != null && now - prev < WINDOW_MS) return true
  lastSent.set(sig, now)
  sessionCount += 1
  // Keep the map bounded under a flood of distinct signatures: drop entries
  // whose window has already lapsed (they can't suppress anything any more).
  if (lastSent.size > MAP_CAP) {
    for (const [k, t] of lastSent) {
      if (now - t >= WINDOW_MS) lastSent.delete(k)
    }
  }
  return false
}

// Test hook - reset the module state between cases.
export function _resetErrorLogThrottle() {
  lastSent.clear()
  sessionCount = 0
}
