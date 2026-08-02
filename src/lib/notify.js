import { supabase, isSupabaseConfigured } from './supabaseClient.js'

// Best-effort trigger for netlify/functions/send-push.js - never throws,
// since a failed push send should never interrupt whoever just posted a
// bet. Local (no-Supabase) mode has no server to send from, so this is a
// no-op there.
export async function notifyGroup(groupId, { title, body, url }, excludeUserId) {
  if (!isSupabaseConfigured) return
  try {
    const { data } = await supabase.auth.getSession()
    const accessToken = data.session?.access_token
    if (!accessToken) return
    await fetch('/api/send-push', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accessToken, groupId, excludeUserId, title, body, url })
    })
  } catch {
    // Best-effort - see comment above.
  }
}
