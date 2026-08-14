// Public, no-login records page (src/pages/HallOfFamePage.jsx, route
// /hall-of-fame) - same service-role pattern as public-profile.js, and the
// same privacy scope: only ever reads visibility='public' bet posts, never
// group data. That means every record here is "best of what's been posted
// publicly", not literally the best bet anyone's ever placed on the app -
// a real limitation worth being upfront about on the page itself, since a
// great pick only shared inside a private group can't show up here.
import { createClient } from '@supabase/supabase-js'
import { cacheGet, cacheSet } from '../../src/lib/apiCache.js'
import { computeLongestWinStreak, computeStats } from '../../src/utils/trackerStats.js'
import { tipsterBadge } from '../../src/utils/tipsterBadge.js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const TTL = 60 * 60 * 1000 // records don't need to be fresher than hourly

function holder(row) {
  return { name: row.profiles?.display_name ?? 'Someone', code: row.profiles?.friend_code ?? null }
}

export default async (req) => {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify(null), { status: 200, headers: { 'content-type': 'application/json' } })
  }

  const cached = cacheGet('hall-of-fame')
  if (cached) return new Response(JSON.stringify(cached), { status: 200, headers: { 'content-type': 'application/json' } })

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { data: posts } = await supabase
      .from('bet_posts')
      .select('user_id,stake,stake_hidden,status,potential_return,selections,settled_at,profiles(display_name,friend_code)')
      .eq('visibility', 'public')

    const visible = (posts ?? []).filter((p) => !p.stake_hidden)
    const settled = visible.filter((p) => p.stake && ['won', 'lost', 'void'].includes(p.status))
    const wins = settled.filter((p) => p.status === 'won')

    let biggestWin = null
    let underdog = null
    for (const p of wins) {
      // The first leg's pick, so the Hall of Fame can show a crest/headshot
      // next to the record (see participantBadge on the client). Only these
      // two records name a specific fixture, so only these carry it.
      const leg = p.selections?.[0] ?? {}
      const pick = { event: leg.event ?? 'Bet', selection: leg.selection ?? null, sport: leg.sport ?? null, market: leg.market ?? null, marketKey: leg.marketKey ?? null }
      const profit = Number(p.potential_return) - Number(p.stake)
      if (!biggestWin || profit > biggestWin.profit) {
        biggestWin = { ...holder(p), profit, ...pick }
      }
      const combined = (p.selections ?? []).reduce((acc, s) => acc * s.odds, 1)
      if (!underdog || combined > underdog.odds) {
        underdog = { ...holder(p), odds: combined, ...pick }
      }
    }

    const byUser = new Map()
    for (const p of settled) {
      if (!byUser.has(p.user_id)) byUser.set(p.user_id, { info: holder(p), entries: [] })
      byUser.get(p.user_id).entries.push({ stake: p.stake, status: p.status, potentialReturn: p.potential_return, settledAt: p.settled_at })
    }
    const postCounts = new Map()
    for (const p of visible) postCounts.set(p.user_id, { info: holder(p), count: (postCounts.get(p.user_id)?.count ?? 0) + 1 })

    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    let topProfit = null
    let monthTopProfit = null
    let longestStreak = null
    let sharpestTipster = null
    for (const { info, entries } of byUser.values()) {
      const profit = entries.reduce((sum, e) => {
        if (e.status === 'won') return sum + (Number(e.potentialReturn) - Number(e.stake))
        if (e.status === 'lost') return sum - Number(e.stake)
        return sum
      }, 0)
      if (!topProfit || profit > topProfit.profit) topProfit = { ...info, profit }

      // Resets naturally every month since it's a live filter, not a
      // stored snapshot - so there's no separate cron job needed to "roll
      // over" the record, it's just whatever the current month's numbers say.
      const monthEntries = entries.filter((e) => e.settledAt && new Date(e.settledAt) >= monthStart)
      if (monthEntries.length) {
        const monthProfit = monthEntries.reduce((sum, e) => {
          if (e.status === 'won') return sum + (Number(e.potentialReturn) - Number(e.stake))
          if (e.status === 'lost') return sum - Number(e.stake)
          return sum
        }, 0)
        if (!monthTopProfit || monthProfit > monthTopProfit.profit) monthTopProfit = { ...info, profit: monthProfit }
      }

      const count = computeLongestWinStreak(entries)
      if (count > 0 && (!longestStreak || count > longestStreak.count)) longestStreak = { ...info, count }

      const stats = computeStats(entries)
      const badge = tipsterBadge(stats)
      if (badge && (!sharpestTipster || stats.winRate > sharpestTipster.winRate)) {
        sharpestTipster = { ...info, winRate: stats.winRate, decidedCount: stats.decidedCount, badge }
      }
    }

    let mostActive = null
    for (const { info, count } of postCounts.values()) {
      if (!mostActive || count > mostActive.count) mostActive = { ...info, count }
    }

    // Not scoped to public posts like everything else above - referred_by
    // is attribution (who invited whom), not betting activity, so there's
    // no visibility='public' concept to filter it by.
    let topRecruiter = null
    const { data: referred } = await supabase.from('profiles').select('referred_by').not('referred_by', 'is', null)
    const referralCounts = new Map()
    for (const p of referred ?? []) referralCounts.set(p.referred_by, (referralCounts.get(p.referred_by) ?? 0) + 1)
    if (referralCounts.size) {
      const [topId, count] = [...referralCounts.entries()].sort((a, b) => b[1] - a[1])[0]
      const { data: recruiter } = await supabase.from('profiles').select('display_name,friend_code').eq('id', topId).maybeSingle()
      if (recruiter) topRecruiter = { name: recruiter.display_name, code: recruiter.friend_code, count }
    }

    const body = { biggestWin, underdog, topProfit, monthTopProfit, longestStreak, mostActive, topRecruiter, sharpestTipster }
    cacheSet('hall-of-fame', body, TTL)
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
}
