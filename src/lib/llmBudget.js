// Global daily spend breaker for the LLM-backed endpoints (netlify/functions/
// coach.js and coachgpt.js). A soft safety valve that sits on TOP of each
// endpoint's own per-user caps: it bounds total model spend across ALL users
// per UTC day, so a runaway - a scripted flood of trivial free signups, a bug
// looping requests - can't run the Anthropic bill unbounded. The per-user caps
// meter normal use; this only ever catches an abnormal spike.
//
// It counts in "call-units" via the bump_llm_budget RPC (supabase/schema.sql),
// which atomically increments today's tally and reports whether it's still
// within the cap. Each request bumps by its worst-case number of model calls
// (a CoachGPT chat message can fan out to several rounds + a lock-in call; a
// passive Coach take is one). The RPC is security-definer, so a plain
// user-token client can call it without any direct grant on the table.
//
// Fails OPEN. If there's no client (an unconfigured local deploy), the RPC is
// missing, or the DB errors, it returns "allowed" rather than blocking - the
// valve exists to stop a runaway, not to become a new way for a database hiccup
// to take the whole feature down for everyone. That matches the
// "missing keys / infra degrade, don't crash" contract the rest of the
// functions follow. The cap is configurable via LLM_DAILY_CALL_CAP.

const DEFAULT_CAP = 8000

export async function withinLlmBudget(client, cost = 1) {
  if (!client) return true
  const cap = Number(process.env.LLM_DAILY_CALL_CAP) || DEFAULT_CAP
  try {
    const { data, error } = await client.rpc('bump_llm_budget', { _max: cap, _n: cost })
    if (error) return true // fail open - a DB hiccup must not block the feature
    return data !== false // RPC returns false only once the cap is exceeded
  } catch {
    return true
  }
}
