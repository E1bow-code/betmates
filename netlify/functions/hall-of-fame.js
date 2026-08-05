// Public, no-login records page (src/pages/HallOfFamePage.jsx, route
// /hall-of-fame) - same service-role pattern as public-profile.js, and the
// same privacy scope: only ever reads visibility='public' bet posts, never
// group data. That means every record here is "best of what's been posted
// publicly", not literally the best bet anyone's ever placed on the app -
// a real limitation worth being upfront about on the page itself, since a
// great pick only shared inside a private group can't show up here.
import { createClient } from '@supabase/supabase-js'
import { cacheGet, cacheSet } from '../../src/lib/apiCache.js'
import { computeLongestWinStreak } from '../../src/utils/trackerStats.js'

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
      const profit = Number(p.potential_return) - Number(p.stake)
      if (!biggestWin || profit > biggestWin.profit) {
        biggestWin = { ...holder(p), profit, event: p.selections?.[0]?.event ?? 'Bet' }
      }
      const combined = (p.selections ?? []).reduce((acc, s) => acc * s.odds, 1)
      if (!underdog || combined > underdog.odds) {
        underdog = { ...holder(p), odds: combined, event: p.selections?.[0]?.event ?? 'Bet' }
      }
    }

    const byUser = new Map()
    for (const p of settled) {
      if (!byUser.has(p.user_id)) byUser.set(p.user_id, { info: holder(p), entries: [] })
      byUser.get(p.user_id).entries.push({ stake: p.stake, status: p.status, potentialReturn: p.potential_return, settledAt: p.settled_at })
    }
    const postCounts = new Map()
    for (const p of visible) postCounts.set(p.user_id, { info: holder(p), count: (postCounts.get(p.user_id)?.count ?? 0) + 1 })

    let topProfit = null
    let longestStreak = null
    for (const { info, entries } of byUser.values()) {
      const profit = entries.reduce((sum, e) => {
        if (e.status === 'won') return sum + (Number(e.potentialReturn) - Number(e.stake))
        if (e.status === 'lost') return sum - Number(e.stake)
        return sum
      }, 0)
      if (!topProfit || profit > topProfit.profit) topProfit = { ...info, profit }

      const count = computeLongestWinStreak(entries)
      if (count > 0 && (!longestStreak || count > longestStreak.count)) longestStreak = { ...info, count }
    }

    let mostActive = null
    for (const { info, count } of postCounts.values()) {
      if (!mostActive || count > mostActive.count) mostActive = { ...info, count }
    }

    const body = { biggestWin, underdog, topProfit, longestStreak, mostActive }
    cacheSet('hall-of-fame', body, TTL)
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
}
