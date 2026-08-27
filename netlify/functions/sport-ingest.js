// Scheduled function - the ingest half of BetMates' own generic-sports API.
// For each configured sport it calls sport.js's fetchLiveSportItems (the SAME
// provider logic the live proxy uses - Odds API or SportsGameOdds, tennis
// dynamic keys and all) and upserts the result into odds_cache under
// `sport-list-<sport>`. sport.js then serves each of those from our own
// database at zero provider quota. See netlify/functions/odds-ingest.js for the
// fuller rationale.
//
// FREE-TIER BUDGET - read before widening the allowlist. Unlike the football
// (5 credits) and UFC (1 credit) lists, "all generic sports" is genuinely
// expensive, because it spans nine sports across two providers:
//   The Odds API (shares the 500 req/month tier with football + UFC):
//     rugbyLeague 1 + rugbyUnion 1 + cricket 5 + boxing 1 = 8 credits/run,
//     plus tennis (dynamicPrefix - however many tennis_* tournaments are live,
//     often several) = ~12 credits/run.
//   SportsGameOdds (its own 2,500 objects/month tier):
//     basketball + hockey + baseball + nfl = 4 requests, ~25 events each.
// At every 12h that Odds API side alone is ~12 x 2 x 30 = 720 credits/month -
// already over 500 on its own, before football's 450 and UFC's. So on the free
// tier you CANNOT cache everything here; that's inherent to 500 req/month, not
// something the cache changes. The whole point of owning this layer is that
// once you're on a paid tier the cost is fixed and predictable regardless of
// how many users you have.
//
// Two dials, both honoured below:
//   - ODDS_INGEST_SPORTS: comma-separated allowlist of GENERIC_SPORTS keys to
//     ingest (e.g. "basketball,hockey,baseball,nfl" to cache only the
//     separate-quota SGO sports and leave the Odds API ones on live/on-demand).
//     Unset = all generic sports.
//   - the schedule below.
import { createClient } from '@supabase/supabase-js'
import { GENERIC_SPORTS } from '../../src/lib/sportsConfig.js'
import { fetchLiveSportItems } from './sport.js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

function json(body) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

// Which sports to ingest this run - the ODDS_INGEST_SPORTS allowlist if set,
// otherwise every generic sport. Unknown keys are dropped so a typo can't
// error the whole run.
function targetSports() {
  const allowed = (process.env.ODDS_INGEST_SPORTS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const keys = allowed.length ? allowed : Object.keys(GENERIC_SPORTS)
  return keys.filter((k) => GENERIC_SPORTS[k])
}

export default async () => {
  // Master off-switch - see odds-ingest.js. Ships dormant; nothing runs until
  // ODDS_INGEST_ENABLED is set to 'true' in Netlify.
  if (process.env.ODDS_INGEST_ENABLED !== 'true') {
    return json({ ingested: 0, reason: 'ingest disabled' })
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ ingested: 0, reason: 'not configured' })
  }

  try {
    const sports = targetSports()
    const now = new Date().toISOString()

    const settled = await Promise.allSettled(
      sports.map(async (sport) => {
        const { items, dataSource } = await fetchLiveSportItems(sport, GENERIC_SPORTS[sport])
        // Only persist real provider data. An outage ('live-empty') or a
        // missing key ('mock') must never overwrite a good cached row with an
        // empty one - and an off-season sport that genuinely has no events
        // (live but empty) isn't worth a row either; the proxy serves [] fine
        // from the live path.
        if (dataSource !== 'live' || !items.length) return null
        return { cache_key: `sport-list-${sport}`, sport, payload: items, fetched_at: now }
      })
    )

    const rows = settled.filter((r) => r.status === 'fulfilled' && r.value).map((r) => r.value)
    if (!rows.length) return json({ ingested: 0, reason: 'no upstream data', sports })

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { error } = await supabase.from('odds_cache').upsert(rows, { onConflict: 'cache_key' })
    if (error) throw new Error(error.message)

    return json({ ingested: rows.length, sports: rows.map((r) => r.sport) })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return json({ ingested: 0, error: message })
  }
}

export const config = {
  // Every 12h. NOT free-tier-safe with the full sport list enabled (see the
  // budget math in the header) - scope it with ODDS_INGEST_SPORTS or lower the
  // cadence on the free tier; raise it once on a paid plan.
  schedule: '0 */12 * * *'
}
