// Powers the public, no-login-required profile page (src/pages/PublicProfilePage.jsx,
// route /u/:code) - looks a visitor's friend code up and returns their stats
// computed from PUBLIC bet posts only, same as the public feed's own
// visibility rule. Runs on the service-role key because there's no signed-in
// visitor for RLS to key off (the whole point is it works logged out), but
// deliberately only ever touches visibility='public' rows - this is not a
// general RLS bypass for the caller, just enough to answer "what does this
// one person's public profile show."
import { createClient } from '@supabase/supabase-js'
import { computeStats } from '../../src/utils/trackerStats.js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export default async (req) => {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')?.trim().toUpperCase()

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !code) {
    return new Response(JSON.stringify(null), { status: 200, headers: { 'content-type': 'application/json' } })
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    const { data: profile } = await supabase
      .from('profiles')
      .select('id,display_name,created_at,avatar_url,referral_count')
      .eq('friend_code', code)
      .maybeSingle()
    // profile.id wasn't in the original response - it's needed client-side
    // to drive the Follow button (dataStore.followUser/listFollowing key
    // off the target's user id, not their friend code).
    if (!profile) return new Response(JSON.stringify(null), { status: 200, headers: { 'content-type': 'application/json' } })

    const { data: posts } = await supabase
      .from('bet_posts')
      .select('stake,stake_hidden,status,potential_return,created_at,sport,selections')
      .eq('user_id', profile.id)
      .eq('visibility', 'public')

    const entries = (posts ?? [])
      .filter((p) => !p.stake_hidden)
      .map((p) => ({ stake: p.stake, status: p.status, potentialReturn: p.potential_return }))
    const stats = computeStats(entries)

    const recent = (posts ?? [])
      .filter((p) => !p.stake_hidden && ['won', 'lost'].includes(p.status))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 5)
      .map((p) => ({ event: p.selections?.[0]?.event ?? 'Bet', sport: p.sport, status: p.status }))

    return new Response(
      JSON.stringify({
        id: profile.id,
        displayName: profile.display_name,
        avatarUrl: profile.avatar_url,
        memberSince: profile.created_at,
        referralCount: profile.referral_count,
        stats,
        recent
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
}
