// Proxy for horse racing via The Racing API (theracingapi.com), keeping
// RACING_API_USERNAME/RACING_API_PASSWORD server-side. Auth is HTTP Basic
// (a username+password pair the provider issues, not a single key) -
// see https://gist.github.com/theracingapi/85b20143df4cd488293e8c42ed9a6257.
// Reshapes /v1/racecards/standard into the { id, course, raceName, offTime,
// distance, going, raceClass, runners: [...] } shape src/data/mockRacingOdds.js
// already established, so RaceDetailPage/OddsListPage don't change.
//
// Standard Plan only returns real bookmaker odds for UK & Irish racing -
// the same "today's racecards" call also includes French/other regional
// races with no odds at all, which are filtered out below since there'd be
// nothing to bet on. Races that have already gone off, or were abandoned,
// are filtered out too.
import { cacheGet, cacheSet } from '../../src/lib/apiCache.js'
import { logProviderError } from '../../src/lib/logProviderError.js'

const LIST_TTL = 20 * 60 * 1000
const SILK_PALETTE = ['#dc2626', '#2563eb', '#16a34a', '#eab308', '#9333ea', '#0891b2', '#ea580c', '#db2777']

async function serveMock(id) {
  const { getMockRaces, getMockRace } = await import('../../src/data/mockRacingOdds.js')
  const body = id ? getMockRace(id) : getMockRaces()
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', 'x-data-source': 'mock' }
  })
}

export default async (req) => {
  const username = process.env.RACING_API_USERNAME
  const password = process.env.RACING_API_PASSWORD
  const url = new URL(req.url)
  const id = url.searchParams.get('id')

  if (!username || !password) return serveMock(id)

  try {
    let races = cacheGet('racing-races')
    if (!races) {
      const auth = Buffer.from(`${username}:${password}`).toString('base64')
      const res = await fetch('https://api.theracingapi.com/v1/racecards/standard', {
        headers: { Authorization: `Basic ${auth}` }
      })
      if (!res.ok) {
        console.error(`Racing provider error (${res.status}), falling back to mock`)
        await logProviderError('racing', `HTTP ${res.status}`)
        return serveMock(id)
      }
      const { racecards } = await res.json()
      const now = Date.now()
      races = racecards
        .filter((r) => !r.is_abandoned && new Date(r.off_dt).getTime() > now)
        .map(reshapeRace)
        .filter((r) => r.runners.some((runner) => runner.allOdds.length > 0))
        .sort((a, b) => new Date(a.offTime) - new Date(b.offTime))
      cacheSet('racing-races', races, LIST_TTL)
    }
    const body = id ? races.find((r) => r.id === id) ?? null : races
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json', 'x-data-source': 'live' }
    })
  } catch (err) {
    console.error('Racing provider error, falling back to mock:', err.message)
    await logProviderError('racing', err.message)
    return serveMock(id)
  }
}

function reshapeRace(race) {
  return {
    id: race.race_id,
    course: race.course,
    raceName: race.race_name,
    offTime: race.off_dt,
    distance: (race.distance || `${race.distance_f}f`).replace(/^0m/, ''),
    going: race.going,
    raceClass: race.race_class || '',
    runners: (race.runners ?? []).map(reshapeRunner)
  }
}

// "-" is theracingapi's own placeholder for "no rating yet" - normalised to
// null so RaceDetailPage can just check truthiness instead of every caller
// re-checking for the dash.
function orNull(value) {
  return value && value !== '-' ? value : null
}

function reshapeRunner(runner) {
  const number = Number(runner.number) || 0
  const allOdds = (runner.odds ?? [])
    .map((o) => ({ bookmaker: o.bookmaker, price: o.fractional, decimal: Number(o.decimal) }))
    .filter((o) => Number.isFinite(o.decimal) && o.decimal > 1)
    .sort((a, b) => b.decimal - a.decimal)

  return {
    id: runner.horse_id,
    number,
    name: runner.horse,
    jockey: runner.jockey,
    trainer: runner.trainer,
    silkColor: SILK_PALETTE[number % SILK_PALETTE.length],
    allOdds,
    bestOdds: allOdds.length ? allOdds[0] : null,
    // Recent-form and rating data theracingapi's racecards already return
    // alongside odds (Standard plan) - previously discarded here. Numbers
    // come through as strings from the API; left as-is, RaceDetailPage
    // only displays them, never does arithmetic on them.
    form: orNull(runner.form),
    officialRating: orNull(runner.ofr),
    racingPostRating: orNull(runner.rpr),
    // theracingapi's Topspeed figure - a speed rating (how fast the horse has
    // actually run) rather than the handicapper's OR/RPR opinion. Field name
    // falls back defensively; like every rating here it's orNull'd, so a race
    // or plan without it just leaves the speed indicator unrendered.
    speedFigure: orNull(runner.ts ?? runner.topspeed),
    daysSinceLastRun: orNull(runner.last_run),
    age: orNull(runner.age),
    weightLbs: orNull(runner.lbs),
    draw: orNull(runner.draw),
    headgear: orNull(runner.headgear),
    spotlight: orNull(runner.spotlight)
  }
}
