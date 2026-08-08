// Scheduled function (see `config.schedule` below) - records the current best
// price of every outcome an OPEN bet references into the odds_snapshots table,
// building the price history that table was always meant to hold (nothing wrote
// to it before this - see the note in src/lib/oddsMemory.js). The last snapshot
// taken at or before a fixture's kickoff is that outcome's *closing line* - the
// number src/utils/clv.js compares a struck price against to compute real
// Closing Line Value, upgrading the device-local approximation in
// src/utils/lineValue.js to a true, cross-device close.
//
// Runs on the service-role key like every other scheduled function - nobody's
// signed in when a cron fires, and it needs to read every user's open bets, not
// just one poster's own group.
//
// Free-tier budget: this shares the same 500-request/month Odds API as the rest
// of the app (see src/lib/apiCache.js), so it does NOT hit the provider
// directly. It reads this project's own /api/odds, which is already cached
// (LIST_TTL) and falls back to mock when no key is set - so a run landing near a
// user's own odds view shares that quota instead of spending it twice, and it
// only fetches at all when there is an open bet to snapshot. Mock odds are
// skipped via the x-data-source header, so a dev/no-key run never records a fake
// "closing" price as if it were real.
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SITE_URL = process.env.URL || 'https://betmates.org'

export default async () => {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ snapshotted: 0, reason: 'not configured' }), { status: 200 })
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    // Only the outcomes open bets actually reference get snapshotted, so both
    // the work and the stored history stay proportional to real betting
    // activity rather than the whole odds board.
    const [{ data: posts }, { data: manual }] = await Promise.all([
      supabase.from('bet_posts').select('selections').eq('status', 'open'),
      supabase.from('manual_entries').select('selections').eq('status', 'open')
    ])

    // Keyed exactly how src/utils/clv.js looks a closing price up.
    const wanted = new Set()
    for (const row of [...(posts ?? []), ...(manual ?? [])]) {
      for (const leg of row.selections ?? []) {
        if (!leg?.eventId || !leg?.marketKey || !leg?.outcomeName) continue
        wanted.add(`${leg.eventId}|${leg.marketKey}|${leg.outcomeName}`)
      }
    }
    if (!wanted.size) {
      return new Response(JSON.stringify({ snapshotted: 0, reason: 'no open bets' }), { status: 200 })
    }

    // Piggyback on the app's own cached odds feed rather than the provider.
    const res = await fetch(`${SITE_URL}/api/odds`)
    if (!res.ok) {
      return new Response(JSON.stringify({ snapshotted: 0, reason: `odds ${res.status}` }), { status: 200 })
    }
    // Never record mock prices as if they were a real close.
    if (res.headers.get('x-data-source') === 'mock') {
      return new Response(JSON.stringify({ snapshotted: 0, reason: 'mock odds' }), { status: 200 })
    }
    const fixtures = await res.json()

    const now = new Date().toISOString()
    // odds_snapshots.fixture_id references fixtures(id), so any fixture we
    // snapshot has to exist there first - collect the rows to upsert alongside.
    const fixtureRows = new Map()
    const snapshots = []
    for (const fixture of fixtures ?? []) {
      for (const market of fixture.markets ?? []) {
        for (const outcome of market.outcomes ?? []) {
          if (!wanted.has(`${fixture.id}|${market.key}|${outcome.name}`)) continue
          const decimal = outcome.bestOdds?.decimal
          if (!Number.isFinite(decimal)) continue
          fixtureRows.set(fixture.id, {
            id: fixture.id,
            sport: 'football',
            competition: fixture.competition ?? null,
            home_team: fixture.homeTeam,
            away_team: fixture.awayTeam,
            kickoff: fixture.kickoff,
            status: 'scheduled'
          })
          snapshots.push({
            fixture_id: fixture.id,
            bookmaker: outcome.bestOdds?.bookmaker ?? 'best',
            market: market.key,
            selection: outcome.name,
            odds: decimal,
            fetched_at: now
          })
        }
      }
    }
    if (!snapshots.length) {
      return new Response(JSON.stringify({ snapshotted: 0, reason: 'no matching prices' }), { status: 200 })
    }

    await supabase.from('fixtures').upsert([...fixtureRows.values()], { onConflict: 'id' })
    await supabase.from('odds_snapshots').insert(snapshots)

    return new Response(JSON.stringify({ snapshotted: snapshots.length, fixtures: fixtureRows.size }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ snapshotted: 0, error: message }), { status: 200 })
  }
}

export const config = {
  // Every 30 min, the same cadence as the app's other schedulers. A fixture's
  // price gets sampled repeatedly as kickoff nears; the last sample at or before
  // kickoff is its closing line. Only fixtures with an open bet are ever fetched.
  schedule: '*/30 * * * *'
}
