// Surfaces a Netlify Function's provider fallback (Odds API/Racing API/
// SportsGameOdds quota exhausted, erroring, or unreachable) on the existing
// admin error log (src/pages/AdminErrorLogsPage.jsx, route /admin/errors)
// instead of only Netlify's own ephemeral function console logs. Without
// this, a provider degrading to mock/empty data - which CLAUDE.md's own
// contract says should never crash the app - looks identical to normal
// mock-mode from the outside, so a real quota exhaustion could run
// unnoticed indefinitely.
//
// Reuses error_logs' existing open insert policy ("anyone can log a client
// error" in schema.sql) rather than a service-role key - same trust model
// as the client's own logClientError in dataStore.js, just called from a
// function instead of a browser. Never throws - a logging failure shouldn't
// break the actual fallback response it's trying to report.
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY

/** @param {string} source @param {string} message */
export async function logProviderError(source, message) {
  if (!SUPABASE_URL || !ANON_KEY) return
  try {
    const supabase = createClient(SUPABASE_URL, ANON_KEY)
    await supabase.from('error_logs').insert({
      message: message.slice(0, 2000),
      route: `provider:${source}`
    })
  } catch {
    // Best-effort - see header comment.
  }
}
