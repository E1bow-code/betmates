// Scheduled function (see `config.schedule` below), 00:00 UTC on the 1st of
// every month - snapshots last month's #1 by profit into season_results
// (see supabase/schema.sql), both per-group and globally across public
// posts, using computeSeasonWinner (src/utils/groupLeaderboard.js) - the
// exact same profit math the live Leaderboard.jsx month tab already uses,
// so an archived season's champion can never disagree with what the
// leaderboard itself showed at the time. Same service-role pattern as every
// other scheduled function - nobody's signed in when a cron job fires.
import { createClient } from '@supabase/supabase-js'
import { computeSeasonWinner } from '../../src/utils/groupLeaderboard.js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

function mapPost(row) {
  return { userId: row.user_id, stake: row.stake, stakeHidden: row.stake_hidden, status: row.status, potentialReturn: row.potential_return, settledAt: row.settled_at }
}

// Runs at 00:00 on the 1st, so "last month" is always the previous calendar
// month relative to right now - JS Date normalises month -1 into December
// of the prior year on its own, no January special-casing needed.
function previousPeriod() {
  const now = new Date()
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`
}

function seasonRow({ scope, groupId, period, winner }) {
  return {
    scope,
    group_id: groupId,
    period,
    winner_user_id: winner.userId,
    winner_name: winner.name,
    profit: winner.profit,
    roi: winner.roi,
    win_rate: winner.winRate,
    settled_count: winner.settledCount
  }
}

export default async (req) => {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ written: 0, reason: 'not configured' }), { status: 200 })
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const period = previousPeriod()

    const [{ data: groupRows }, { data: publicRows }, { data: profiles }] = await Promise.all([
      supabase
        .from('bet_posts')
        .select('group_id,user_id,stake,stake_hidden,status,potential_return,settled_at')
        .not('group_id', 'is', null)
        .in('status', ['won', 'lost', 'void']),
      supabase
        .from('bet_posts')
        .select('user_id,stake,stake_hidden,status,potential_return,settled_at')
        .is('group_id', null)
        .eq('visibility', 'public')
        .in('status', ['won', 'lost', 'void']),
      supabase.from('profiles').select('id,display_name')
    ])

    const memberNames = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.display_name]))

    const postsByGroup = new Map()
    for (const row of groupRows ?? []) {
      if (!postsByGroup.has(row.group_id)) postsByGroup.set(row.group_id, [])
      postsByGroup.get(row.group_id).push(mapPost(row))
    }

    const groupResults = []
    for (const [groupId, posts] of postsByGroup) {
      const winner = computeSeasonWinner(posts, memberNames, period)
      if (winner) groupResults.push(seasonRow({ scope: 'group', groupId, period, winner }))
    }

    if (groupResults.length) {
      // group_id is never null on these rows, so the real unique(group_id,
      // period) constraint applies cleanly - a re-run for a period already
      // written (a retried invocation, a manual backfill) updates in place.
      const { error } = await supabase.from('season_results').upsert(groupResults, { onConflict: 'group_id,period' })
      if (error) throw error
    }

    // The global row has no unique constraint to upsert against (see
    // schema.sql's comment on why) - one row a month makes a plain
    // check-then-write simpler than fighting PostgREST over a partial index.
    const globalWinner = computeSeasonWinner((publicRows ?? []).map(mapPost), memberNames, period)
    if (globalWinner) {
      const globalRow = seasonRow({ scope: 'global', groupId: null, period, winner: globalWinner })
      const { data: existing } = await supabase.from('season_results').select('id').eq('scope', 'global').eq('period', period).maybeSingle()
      const { error } = existing
        ? await supabase.from('season_results').update(globalRow).eq('id', existing.id)
        : await supabase.from('season_results').insert(globalRow)
      if (error) throw error
    }

    const written = groupResults.length + (globalWinner ? 1 : 0)
    return new Response(JSON.stringify({ written, period }), { status: 200, headers: { 'content-type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ written: 0, error: err.message }), { status: 200 })
  }
}

export const config = {
  schedule: '0 0 1 * *'
}
