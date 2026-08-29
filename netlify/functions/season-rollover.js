// Scheduled function (see `config.schedule` below), 00:00 UTC on the 1st of
// every month - snapshots last month's #1 by profit into season_results
// (see supabase/schema.sql), both per-group and globally across public
// posts, using computeSeasonWinner (src/utils/groupLeaderboard.js) - the
// exact same profit math the live Leaderboard.jsx month tab already uses,
// so an archived season's champion can never disagree with what the
// leaderboard itself showed at the time. Same service-role pattern as every
// other scheduled function - nobody's signed in when a cron job fires.
import { createClient } from '@supabase/supabase-js'
import { denyUnlessCron } from './_cronAuth.js'
import { computeSeasonWinner, computeSeasonClvWinner } from '../../src/utils/groupLeaderboard.js'
import { closingLinesFromSnapshots } from '../../src/utils/clv.js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

function mapPost(row) {
  return { userId: row.user_id, stake: row.stake, stakeHidden: row.stake_hidden, status: row.status, potentialReturn: row.potential_return, settledAt: row.settled_at, selections: row.selections }
}

// Runs at 00:00 on the 1st, so "last month" is always the previous calendar
// month relative to right now - JS Date normalises month -1 into December
// of the prior year on its own, no January special-casing needed.
function previousPeriod() {
  const now = new Date()
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`
}

function seasonRow({ scope, groupId, period, winner, clvWinner }) {
  return {
    scope,
    group_id: groupId,
    period,
    winner_user_id: winner.userId,
    winner_name: winner.name,
    profit: winner.profit,
    roi: winner.roi,
    win_rate: winner.winRate,
    settled_count: winner.settledCount,
    // "Sharpest tipster" (CLV) award for the same month - null when nobody
    // cleared the CLV sample gate (see computeSeasonClvWinner).
    clv_winner_user_id: clvWinner?.userId ?? null,
    clv_winner_name: clvWinner?.name ?? null,
    clv_avg_pct: clvWinner?.clv.avgPct ?? null,
    clv_beat_rate: clvWinner?.clv.beatRate ?? null,
    clv_sample: clvWinner?.clv.sample ?? null
  }
}

export default async (req) => {
  const _denied = denyUnlessCron(req)
  if (_denied) return _denied

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ written: 0, reason: 'not configured' }), { status: 200 })
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const period = previousPeriod()

    const [{ data: groupRows }, { data: publicRows }, { data: profiles }] = await Promise.all([
      supabase
        .from('bet_posts')
        .select('group_id,user_id,stake,stake_hidden,status,potential_return,settled_at,selections')
        .not('group_id', 'is', null)
        .in('status', ['won', 'lost', 'void']),
      supabase
        .from('bet_posts')
        .select('user_id,stake,stake_hidden,status,potential_return,settled_at,selections')
        .is('group_id', null)
        .eq('visibility', 'public')
        .in('status', ['won', 'lost', 'void']),
      supabase.from('profiles').select('id,display_name')
    ])

    const memberNames = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.display_name]))

    // Closing lines for the "sharpest tipster" (CLV) award. Gather every fixture
    // the month's posts reference, pull their snapshots + kickoffs, and reduce to
    // the same closing-line map the client builds (src/utils/clv.js) - so an
    // archived CLV champion matches what the live leaderboard's CLV tab showed.
    const fixtureIds = [
      ...new Set(
        [...(groupRows ?? []), ...(publicRows ?? [])].flatMap((r) => (r.selections ?? []).map((s) => s.eventId)).filter(Boolean)
      )
    ]
    let closes = {}
    if (fixtureIds.length) {
      const [{ data: snaps }, { data: fx }] = await Promise.all([
        supabase.from('odds_snapshots').select('fixture_id,market,selection,odds,fetched_at').in('fixture_id', fixtureIds),
        supabase.from('fixtures').select('id,kickoff').in('id', fixtureIds)
      ])
      closes = closingLinesFromSnapshots(snaps, new Map((fx ?? []).map((f) => [f.id, f.kickoff])))
    }

    const postsByGroup = new Map()
    for (const row of groupRows ?? []) {
      if (!postsByGroup.has(row.group_id)) postsByGroup.set(row.group_id, [])
      postsByGroup.get(row.group_id).push(mapPost(row))
    }

    const groupResults = []
    for (const [groupId, posts] of postsByGroup) {
      const winner = computeSeasonWinner(posts, memberNames, period)
      if (winner) {
        const clvWinner = computeSeasonClvWinner(posts, memberNames, closes, period)
        groupResults.push(seasonRow({ scope: 'group', groupId, period, winner, clvWinner }))
      }
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
    const globalPosts = (publicRows ?? []).map(mapPost)
    const globalWinner = computeSeasonWinner(globalPosts, memberNames, period)
    if (globalWinner) {
      const globalClvWinner = computeSeasonClvWinner(globalPosts, memberNames, closes, period)
      const globalRow = seasonRow({ scope: 'global', groupId: null, period, winner: globalWinner, clvWinner: globalClvWinner })
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
