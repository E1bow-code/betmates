// Permanently deletes the caller's account. Destructive and irreversible,
// so unlike the read-only service-role functions elsewhere (public-
// profile.js, hall-of-fame.js), this only ever acts on the identity
// Supabase Auth itself confirms behind the caller's access token - never
// on a client-supplied user id.
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: 'Account deletion is not configured.' }), { status: 500 })
  }

  try {
    const { accessToken } = await req.json()
    if (!accessToken) {
      return new Response(JSON.stringify({ error: 'Missing accessToken' }), { status: 400 })
    }

    const authClient = createClient(SUPABASE_URL, ANON_KEY)
    const { data: userData, error: userError } = await authClient.auth.getUser(accessToken)
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired session.' }), { status: 401 })
    }
    const userId = userData.user.id

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    // Groups this user created can't just cascade away with them - that
    // would wipe the whole group's shared history for every other member
    // over one person deleting their account. Hand ownership to whoever's
    // been a member the longest instead, and only delete the group if the
    // creator was its only member.
    const { data: ownedGroups, error: ownedError } = await admin.from('groups').select('id').eq('created_by', userId)
    if (ownedError) throw ownedError

    for (const group of ownedGroups ?? []) {
      const { data: otherMembers, error: membersError } = await admin
        .from('group_members')
        .select('user_id')
        .eq('group_id', group.id)
        .neq('user_id', userId)
        .order('joined_at', { ascending: true })
        .limit(1)
      if (membersError) throw membersError

      if (otherMembers?.length) {
        const { error: reassignError } = await admin.from('groups').update({ created_by: otherMembers[0].user_id }).eq('id', group.id)
        if (reassignError) throw reassignError
      } else {
        const { error: deleteGroupError } = await admin.from('groups').delete().eq('id', group.id)
        if (deleteGroupError) throw deleteGroupError
      }
    }

    // Cascades the profiles row and, from there, every remaining table
    // that references it (bet_posts, reactions, comments, group messages,
    // manual entries, friendships, follows, blocks, push subscriptions...)
    // - see the "Account deletion cascades" section of schema.sql.
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId)
    if (deleteError) throw deleteError

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'content-type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
}
