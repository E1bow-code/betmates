// Scheduled function (see `config.schedule` below) - records the current best
// price of every outcome an OPEN bet references into the odds_snapshots table,
// building the price history that table was always meant to hold. The last
// snapshot taken at or before a fixture's kickoff is that outcome's *closing
// line* - the number src/utils/clv.js compares a struck price against to
// compute real Closing Line Value, upgrading the device-local approximation in
// src/utils/lineValue.js to a true, cross-device close.
//
// Runs on the service-role key like every other scheduled function - nobody's
// signed in when a cron fires, and it needs to read every user's open bets, not
// just one poster's own group.
//
// Free-tier budget: this shares the same 500-request/month Odds API as the rest
// of the app (see src/lib/apiCache.js), so it does NOT hit the provider
// directly. It reads this project's own /api/* routes, already cached
// (LIST_TTL) - so a run landing near a user's own odds view shares that quota
// instead of spending it twice - and only fetches a SPORT'S list at all when an
// open bet actually references that sport, the same "only fetch what's in
// play" rule alert-checks.js's runValueEdgeAlerts follows. Mock odds are
// skipped via the x-data-source header, so a dev/no-key run never records a
// fake "closing" price as if it were real.
//
// Covers every sport that stamps leg-identity keys at bet time
// (FixtureDetailPage.jsx/FightDetailPage.jsx/GenericEventDetailPage.jsx/
// RaceDetailPage.jsx all set eventId/marketKey/outcomeName on toggleLeg).
// Racing's "fixture" is the RACE, not a runner, and a race has no home/away
// side - fixtures.home_team/away_team are nullable (see schema.sql) and left
// null for racing rows; nothing reads those two columns today, only
// fixtures.kickoff and odds_snapshots' own columns feed CLV.
//
// Also snapshots EVERY outcome (not just one specific leg) of a fixture
// that's in followed_fixtures - this is what src/utils/sharpMoney.js's
// movement detection needs: a real time series for a whole outcome, not
// just the single leg someone happened to bet on. Deliberately NOT the
// whole board (that would need a materially bigger, less self-limiting
// fetch pattern than every other job here uses) - scoped to fixtures
// someone cared enough about to follow, the same "only track what's in
// play" principle as the open-bet snapshotting above.
import { createClient } from '@supabase/supabase-js'
import { denyUnlessCron } from './_cronAuth.js'
import { notifyDiscord } from '../../src/lib/discordNotify.js'
import { biggestSharpMove } from '../../src/lib/marketSteam.js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SITE_URL = process.env.URL || 'https://betmates.org'

// Nova (Markets Trader): after snapshots land, look at the recent price history
// of the fixtures we just touched and post one Discord line about the single
// biggest "sharp money" move (src/lib/marketSteam.js -> src/utils/sharpMoney.js).
// Best-effort and never throws: a signal, not part of the snapshot contract, so
// a Discord/DB hiccup here must not fail the run that already stored prices. No
// per-move dedupe state, so a move that persists across runs can re-announce -
// acceptable at the daily pre-launch cadence (one "biggest steam" digest line);
// worth a dedupe watermark if restored to */30.
async function flagSharpMove(supabase, fixtureRows) {
  try {
    const ids = [...fixtureRows.keys()]
    if (!ids.length) return
    const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
    const { data: rows } = await supabase
      .from('odds_snapshots')
      .select('fixture_id,market,selection,bookmaker,odds,fetched_at')
      .in('fixture_id', ids)
      .gte('fetched_at', since)
    const move = biggestSharpMove(rows ?? [])
    if (!move) return
    const fx = fixtureRows.get(move.fixtureId)
    const label = fx?.home_team && fx?.away_team ? `${fx.home_team} v ${fx.away_team}` : fx?.competition || move.fixtureId
    const verb = move.direction === 'shortening' ? 'shortening (money coming for it)' : 'drifting (money coming off it)'
    await notifyDiscord(`📈 **Nova · Markets** — biggest steam: **${move.selection}** (${label}) ${verb}, ${move.from} → ${move.to} (${move.pct}%).`)
  } catch {
    // best-effort signal - never fail the snapshot run over it
  }
}

function sportListPath(sport) {
  if (sport === 'football') return '/api/odds'
  if (sport === 'ufc') return '/api/ufc'
  if (sport === 'racing') return '/api/racing'
  return `/api/sport?sport=${encodeURIComponent(sport)}`
}

/** @param {string} sport @returns {Promise<any[]>} */
async function fetchSportList(sport) {
  try {
    const res = await fetch(`${SITE_URL}${sportListPath(sport)}`)
    if (!res.ok) return []
    // Never record a mock price as if it were a real close - skip just this
    // sport's list rather than bailing the whole run, so one mock-configured
    // sport (or a dev/no-key environment) can't block real closes for others.
    if (res.headers.get('x-data-source') === 'mock') return []
    return await res.json()
  } catch {
    return []
  }
}

// Two-participant sports (football, ufc, every GENERIC_SPORTS entry) share one
// shape: markets[].outcomes[] on each item, keyed id|market.key|outcome.name -
// exactly what odds.js/ufc.js/sport.js already return. An outcome gets
// snapshotted if EITHER an open bet references that exact leg (wantedLegs,
// feeds CLV) OR the whole fixture is followed (wantedFixtureIds, feeds
// sharp-money movement detection across every outcome, not just one leg).
/** @param {any[]} items @param {string} sport @param {Set<string>} wantedLegs @param {Set<string>} wantedFixtureIds @param {Map<string, any>} fixtureRows @param {any[]} snapshots @param {string} now */
function collectFixtureSnapshots(items, sport, wantedLegs, wantedFixtureIds, fixtureRows, snapshots, now) {
  for (const item of items ?? []) {
    // fixtures.kickoff is NOT NULL, and a fixture with no kickoff has no
    // definable closing line anyway (the close is the last snapshot at or
    // before kickoff), so skip it here rather than let one kickoff-less item
    // fail the whole fixtures upsert batch - which used to FK-block the entire
    // odds_snapshots insert and lose every fixture's snapshot for that run.
    if (item.kickoff == null) continue
    for (const market of item.markets ?? []) {
      for (const outcome of market.outcomes ?? []) {
        const wanted = wantedLegs.has(`${item.id}|${market.key}|${outcome.name}`) || wantedFixtureIds.has(item.id)
        if (!wanted) continue
        const decimal = outcome.bestOdds?.decimal
        if (!Number.isFinite(decimal)) continue
        fixtureRows.set(item.id, {
          id: item.id,
          sport,
          competition: item.competition ?? null,
          home_team: item.homeTeam ?? item.participantA ?? item.fighterA ?? null,
          away_team: item.awayTeam ?? item.participantB ?? item.fighterB ?? null,
          kickoff: item.kickoff,
          status: 'scheduled'
        })
        snapshots.push({
          fixture_id: item.id,
          bookmaker: outcome.bestOdds?.bookmaker ?? 'best',
          market: market.key,
          selection: outcome.name,
          odds: decimal,
          fetched_at: now
        })
      }
    }
  }
}

// Racing has no head-to-head market - each runner in the field is its own
// outcome, keyed race.id|win|runner.name (see RaceDetailPage.jsx's pick()).
// Same either/or "wanted" rule as collectFixtureSnapshots above.
/** @param {any[]} races @param {Set<string>} wantedLegs @param {Set<string>} wantedFixtureIds @param {Map<string, any>} fixtureRows @param {any[]} snapshots @param {string} now */
function collectRacingSnapshots(races, wantedLegs, wantedFixtureIds, fixtureRows, snapshots, now) {
  for (const race of races ?? []) {
    if (race.offTime == null) continue // no off-time -> no closing line, and fixtures.kickoff is NOT NULL (see collectFixtureSnapshots)
    for (const runner of race.runners ?? []) {
      const wanted = wantedLegs.has(`${race.id}|win|${runner.name}`) || wantedFixtureIds.has(race.id)
      if (!wanted) continue
      const decimal = runner.bestOdds?.decimal
      if (!Number.isFinite(decimal)) continue
      fixtureRows.set(race.id, {
        id: race.id,
        sport: 'racing',
        competition: `${race.course} - ${race.raceName}`,
        home_team: null,
        away_team: null,
        kickoff: race.offTime,
        status: 'scheduled'
      })
      snapshots.push({
        fixture_id: race.id,
        bookmaker: runner.bestOdds?.bookmaker ?? 'best',
        market: 'win',
        selection: runner.name,
        odds: decimal,
        fetched_at: now
      })
    }
  }
}

export default async (req) => {
  const _denied = denyUnlessCron(req)
  if (_denied) return _denied

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ snapshotted: 0, reason: 'not configured' }), { status: 200 })
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    // Only the outcomes open bets actually reference, or fixtures someone
    // follows, get snapshotted - both keep the work proportional to real
    // activity rather than the whole odds board.
    const [{ data: posts }, { data: manual }, { data: follows }] = await Promise.all([
      supabase.from('bet_posts').select('selections').eq('status', 'open'),
      supabase.from('manual_entries').select('selections').eq('status', 'open'),
      supabase.from('followed_fixtures').select('sport,event_id')
    ])

    // Keyed exactly how src/utils/clv.js looks a closing price up. Also track
    // which sports are actually represented so only those lists get fetched.
    const wantedLegs = new Set()
    const sportsInPlay = new Set()
    for (const row of [...(posts ?? []), ...(manual ?? [])]) {
      for (const leg of row.selections ?? []) {
        if (!leg?.eventId || !leg?.marketKey || !leg?.outcomeName) continue
        wantedLegs.add(`${leg.eventId}|${leg.marketKey}|${leg.outcomeName}`)
        sportsInPlay.add(leg.sport ?? 'football')
      }
    }

    // Whole-fixture follows - every outcome of these gets snapshotted (not
    // just one leg), so src/utils/sharpMoney.js has a real series to look
    // at per outcome, not just the one price an open bet happens to name.
    const wantedFixtureIds = new Set()
    for (const follow of follows ?? []) {
      if (!follow?.event_id) continue
      wantedFixtureIds.add(follow.event_id)
      sportsInPlay.add(follow.sport ?? 'football')
    }

    if (!wantedLegs.size && !wantedFixtureIds.size) {
      return new Response(JSON.stringify({ snapshotted: 0, reason: 'no open bets or follows' }), { status: 200 })
    }

    const now = new Date().toISOString()
    // odds_snapshots.fixture_id references fixtures(id), so any fixture we
    // snapshot has to exist there first - collect the rows to upsert alongside.
    const fixtureRows = new Map()
    const snapshots = []

    await Promise.all(
      [...sportsInPlay].map(async (sport) => {
        const items = await fetchSportList(sport)
        if (sport === 'racing') collectRacingSnapshots(items, wantedLegs, wantedFixtureIds, fixtureRows, snapshots, now)
        else collectFixtureSnapshots(items, sport, wantedLegs, wantedFixtureIds, fixtureRows, snapshots, now)
      })
    )

    if (!snapshots.length) {
      return new Response(JSON.stringify({ snapshotted: 0, reason: 'no matching prices' }), { status: 200 })
    }

    // Surface write failures instead of reporting success over them. The
    // fixtures upsert has to land first (odds_snapshots.fixture_id FKs it), so
    // if it errors the snapshots insert would FK-fail anyway - report and stop
    // rather than claim `snapshotted: N` on a run that wrote nothing, which
    // silently starved CLV and sharp-money history.
    const { error: fixturesError } = await supabase.from('fixtures').upsert([...fixtureRows.values()], { onConflict: 'id' })
    if (fixturesError) {
      return new Response(JSON.stringify({ snapshotted: 0, error: `fixtures upsert failed: ${fixturesError.message}` }), { status: 200 })
    }
    const { error: snapshotsError } = await supabase.from('odds_snapshots').insert(snapshots)
    if (snapshotsError) {
      return new Response(JSON.stringify({ snapshotted: 0, error: `odds_snapshots insert failed: ${snapshotsError.message}` }), { status: 200 })
    }

    // Nova's sharp-money line - after the prices are safely stored.
    await flagSharpMove(supabase, fixtureRows)

    return new Response(
      JSON.stringify({ snapshotted: snapshots.length, fixtures: fixtureRows.size, sports: [...sportsInPlay] }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ snapshotted: 0, error: message }), { status: 200 })
  }
}

export const config = {
  // Normally every 30 min: a fixture's price gets sampled repeatedly as kickoff
  // nears, and the last sample at or before kickoff is its closing line. Only
  // fixtures with an open bet, or a follow, are ever fetched.
  // PRE-LAUNCH: dialled down to once daily to cut Netlify invocations while
  // there are no real users (CLV sampling is coarse until then). Restore
  // '*/30 * * * *' at launch - fine-grained closing lines need the fast cadence.
  schedule: '0 5 * * *'
}
