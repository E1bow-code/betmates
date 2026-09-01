// The shared "act on a proposal" logic for Coco's social posts and Sage's idea
// proposals. Two places can approve/reject a proposal - the Discord button
// endpoint (netlify/functions/discord-interactions.js) and the in-app Agent HQ
// admin endpoint (netlify/functions/agent-action.js) - and they must never
// drift on what approve/reject does, so the decision + writes live here once.
//
// I/O is injected: the caller passes the (service-role) supabase client and the
// approve-side effects (postToX for Coco, openIssue for Sage), so this stays
// pure enough to unit-test and each caller formats the returned result its own
// way (a Discord message edit vs a JSON response).
//
// Each function loads the row, refuses anything not still 'pending' (so a second
// click / double-submit is idempotent), writes the new status, and on approve
// runs the side effect. Returns { ok, status?, message, link? }.

/**
 * @param {any} supabase  a supabase client authorised to read/write social_posts
 * @param {{ id: string, action: 'approve'|'reject', who?: string, postToX: (text: string) => Promise<any> }} opts
 */
export async function settleSocialPost(supabase, { id, action, who = 'operator', postToX }) {
  const { data: row } = await supabase.from('social_posts').select('id,body,status').eq('id', id).maybeSingle()
  if (!row) return { ok: false, message: 'This proposal no longer exists.' }
  if (row.status !== 'pending') return { ok: false, status: row.status, message: `Already ${row.status} - no change.` }

  const now = new Date().toISOString()
  if (action === 'reject') {
    await supabase.from('social_posts').update({ status: 'rejected', decided_at: now }).eq('id', id)
    return { ok: true, status: 'rejected', message: `❌ Rejected by ${who}. Post discarded.` }
  }

  // Approve: mark approved, then publish to X.
  await supabase.from('social_posts').update({ status: 'approved', decided_at: now }).eq('id', id)
  const result = await postToX(row.body)
  if (result.skipped) {
    return { ok: true, status: 'approved', message: `✅ Approved by ${who}. (X not configured, so nothing was published.)` }
  }
  if (result.ok) {
    await supabase.from('social_posts').update({ status: 'posted', external_id: result.id ?? null, posted_at: new Date().toISOString() }).eq('id', id)
    const link = result.id ? `https://x.com/i/status/${result.id}` : null
    return { ok: true, status: 'posted', message: `✅ Approved by ${who} — posted to X.${link ? ` ${link}` : ''}`, link }
  }
  const err = result.error || `HTTP ${result.status}`
  await supabase.from('social_posts').update({ status: 'failed', error: String(err).slice(0, 500) }).eq('id', id)
  return { ok: true, status: 'failed', message: `✅ Approved by ${who}, but the X post failed: ${err}` }
}

/**
 * @param {any} supabase  a supabase client authorised to read/write idea_proposals
 * @param {{ id: string, action: 'approve'|'reject', who?: string, openIssue: (row: any) => Promise<string|null> }} opts
 */
export async function settleIdeaProposal(supabase, { id, action, who = 'operator', openIssue }) {
  const { data: row } = await supabase.from('idea_proposals').select('id,body,sources,status').eq('id', id).maybeSingle()
  if (!row) return { ok: false, message: 'This idea no longer exists.' }
  if (row.status !== 'pending') return { ok: false, status: row.status, message: `Already ${row.status} - no change.` }

  const now = new Date().toISOString()
  if (action === 'reject') {
    await supabase.from('idea_proposals').update({ status: 'rejected', decided_by: who, decided_at: now }).eq('id', id)
    return { ok: true, status: 'rejected', message: `❌ Rejected by ${who}. Idea discarded.` }
  }

  // Approve: record it, then try to log a GitHub issue.
  await supabase.from('idea_proposals').update({ status: 'approved', decided_by: who, decided_at: now }).eq('id', id)
  const issueUrl = await openIssue(row)
  if (issueUrl) {
    await supabase.from('idea_proposals').update({ issue_url: issueUrl }).eq('id', id)
    return { ok: true, status: 'approved', message: `✅ Approved by ${who} — logged as an issue: ${issueUrl}`, link: issueUrl }
  }
  return { ok: true, status: 'approved', message: `✅ Approved by ${who}. Idea saved.` }
}
