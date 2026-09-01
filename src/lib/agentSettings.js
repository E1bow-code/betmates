// Per-agent on/off flags for Agent HQ. The scheduled functions read their own
// flag before they speak (post/propose) and no-op when disabled, so an operator
// can pause an agent from the control room without a deploy.
//
// FAIL OPEN by design: if the agent_settings table isn't there yet (schema not
// applied) or the read errors, the agent is treated as ENABLED. So merging this
// changes nothing until the schema is applied AND an operator flips a switch,
// and a DB hiccup never silently mutes the whole fleet. Only an explicit
// `enabled = false` disables an agent.

/**
 * Pure decision: is `key` enabled, given the loaded settings rows? Default
 * enabled; only an explicit `enabled === false` disables.
 * @param {{ key: string, enabled: boolean }[]} rows
 * @param {string} key
 * @returns {boolean}
 */
export function isEnabled(rows, key) {
  const row = (rows || []).find((r) => r.key === key)
  return !row || row.enabled !== false
}

/**
 * Query one agent's flag (with a service-role or admin client). Fails open on a
 * missing table / error, so a scheduled function is never silenced by infra.
 * @param {any} supabase
 * @param {string} key
 * @returns {Promise<boolean>}
 */
export async function agentEnabled(supabase, key) {
  try {
    const { data, error } = await supabase.from('agent_settings').select('enabled').eq('key', key).maybeSingle()
    if (error) return true
    return !data || data.enabled !== false
  } catch {
    return true
  }
}
