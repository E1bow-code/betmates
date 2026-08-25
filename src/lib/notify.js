import { supabase, isSupabaseConfigured } from './supabaseClient.js'

// Best-effort trigger for netlify/functions/send-push.js - never throws,
// since a failed push send should never interrupt whoever just posted a
// bet. Local (no-Supabase) mode has no server to send from, so this is a
// no-op there.
//
// `gate` names a notification_prefs key send-push.js should require to be
// true before notifying a given member - pass 'betPosted' for an actual
// bet-post announcement (see BetBuilderSheet.jsx), or omit it for a
// group event that isn't a bet post (a tournament starting, say) so it
// stays ungated rather than silently inheriting someone else's toggle.
export async function notifyGroup(groupId, { title, body, url }, excludeUserId, gate) {
  if (!isSupabaseConfigured) return
  try {
    const { data } = await supabase.auth.getSession()
    const accessToken = data.session?.access_token
    if (!accessToken) return
    await fetch('/api/send-push', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accessToken, groupId, excludeUserId, title, body, url, gate })
    })
  } catch {
    // Best-effort - see comment above.
  }
}

export async function notifyFriend(friendId, { title, body, url }) {
  if (!isSupabaseConfigured) return
  try {
    const { data } = await supabase.auth.getSession()
    const accessToken = data.session?.access_token
    if (!accessToken) return
    await fetch('/api/send-push', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accessToken, friendId, title, body, url })
    })
  } catch {
    // Best-effort - see comment above.
  }
}

export async function notifyFollowers(posterId, { title, body, url }) {
  if (!isSupabaseConfigured) return
  try {
    const { data } = await supabase.auth.getSession()
    const accessToken = data.session?.access_token
    if (!accessToken) return
    await fetch('/api/send-push', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // Only ever called for "someone you follow posted a new pick" (see
      // BetBuilderSheet.jsx) - gated on the same betPosted pref as
      // notifyGroup's bet-post path, not a separate toggle, since it's
      // the same underlying event just reaching a different audience.
      body: JSON.stringify({ accessToken, followersOf: posterId, title, body, url, gate: 'betPosted' })
    })
  } catch {
    // Best-effort - see comment above.
  }
}

export async function notifyBetAuthor(authorId, { title, body, url }) {
  if (!isSupabaseConfigured) return
  try {
    const { data } = await supabase.auth.getSession()
    const accessToken = data.session?.access_token
    if (!accessToken) return
    await fetch('/api/send-push', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accessToken, authorId, title, body, url })
    })
  } catch {
    // Best-effort - see comment above.
  }
}
