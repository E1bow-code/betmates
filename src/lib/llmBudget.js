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
// Fails OPEN but BOUNDED. When the global DB tally is reachable it's the real
// cap. When it isn't - no client (unconfigured local deploy), a missing RPC, a
// DB error - we don't block the feature for everyone over a hiccup (that matches
// the "infra degrades, don't crash" contract), but nor do we silently allow
// UNBOUNDED spend, which would turn any DB outage into the exact runaway this
// breaker exists to stop. Instead the DB-unavailable path degrades to a
// conservative PER-INSTANCE ceiling: generous enough that a transient blip never
// disrupts real use, bounded enough that a DB outage during a spike can't run
// the Anthropic bill away. It's per-warm-instance and resets on cold start, so
// it's a floor of protection under failure, not a precise global cap. (An
// unconfigured deploy with no client is still allowed outright - there's no key
// and so no spend to bound.) Caps: LLM_DAILY_CALL_CAP, LLM_FALLBACK_CALL_CAP.

const DEFAULT_CAP = 8000
// Per-instance ceiling used only while the global DB breaker is unreachable.
const FALLBACK_WINDOW_MS = 10 * 60 * 1000
const DEFAULT_FALLBACK_CAP = 200
let _fbWindowStart = 0
let _fbCount = 0

// Bounded allow used when the DB tally can't be consulted. Rolling window,
// per-instance. Returns true until this instance has spent its fallback ceiling
// within the current window, then false - so a DB outage caps spend instead of
// removing the ceiling entirely.
function fallbackAllows(cost) {
  const cap = Number(process.env.LLM_FALLBACK_CALL_CAP) || DEFAULT_FALLBACK_CAP
  const now = Date.now()
  if (now - _fbWindowStart > FALLBACK_WINDOW_MS) {
    _fbWindowStart = now
    _fbCount = 0
  }
  _fbCount += cost
  return _fbCount <= cap
}

export async function withinLlmBudget(client, cost = 1) {
  if (!client) return true
  const cap = Number(process.env.LLM_DAILY_CALL_CAP) || DEFAULT_CAP
  try {
    const { data, error } = await client.rpc('bump_llm_budget', { _max: cap, _n: cost })
    if (error) return fallbackAllows(cost) // DB errored - bounded local ceiling, not unbounded
    return data !== false // RPC returns false only once the cap is exceeded
  } catch {
    return fallbackAllows(cost) // RPC threw - same bounded degrade
  }
}
