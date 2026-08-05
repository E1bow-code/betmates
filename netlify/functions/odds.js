// Proxy between the frontend and The Odds API (theoddsapi.com), keeping
// ODDS_API_KEY server-side. Reshapes their response into the
// { id, competition, homeTeam, awayTeam, kickoff, markets: [...] } shape
// used by src/data/mockFootballOdds.js, so UI code doesn't change when
// switching src/api/oddsClient.js off mock mode.
//
// Free tier: 500 requests/month, and this app is meant to stay on it - see
// src/lib/apiCache.js. The bulk list (5 leagues = 5 credits) is cached for
// LIST_TTL, and a fixture's fully-assembled detail (list lookup + player
// props + extra markets) is cached per-id for DETAIL_TTL, so repeat views
// of the same fixture/list within that window cost nothing further -
// worth keeping short enough that odds don't feel stale, long enough that
// a few friends checking the same match in the same few minutes only
// costs credits once.
import { FOOTBALL_SPORT_KEYS } from '../../src/lib/sportsConfig.js'
import { cacheGet, cacheSet } from '../../src/lib/apiCache.js'
import { pickLink } from '../../src/lib/oddsLinks.js'

const SPORTS = FOOTBALL_SPORT_KEYS
const REGION = 'uk'
const MARKETS = 'h2h,totals'
const EXTRA_MARKET_LABELS = {
  btts: 'Both Teams to Score',
  draw_no_bet: 'Draw No Bet',
  double_chance: 'Double Chance',
  alternate_totals: 'Alternate Total Goals'
}
// The free tier is only 500 requests/month total, shared across football,
// UFC and tennis - a 5-minute cache burns through that in days under any
// real usage (each redeploy also cold-starts the in-memory cache, so a
// dev session doing several deploys costs as much as a day of traffic).
// Odds don't need to be this fresh for a mates' group to compare prices.
const LIST_TTL = 20 * 60 * 1000
const DETAIL_TTL = 30 * 60 * 1000

async function serveMock(id) {
  const { getMockFixtures, getMockFixture } = await import('../../src/data/mockFootballOdds.js')
  const body = id ? getMockFixture(id) : getMockFixtures()
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', 'x-data-source': 'mock' }
  })
}

export default async (req) => {
  const apiKey = process.env.ODDS_API_KEY
  const url = new URL(req.url)
  const id = url.searchParams.get('id')

  if (!apiKey) return serveMock(id)

  try {
    if (id) {
      const cachedFixture = cacheGet(`football-fixture-${id}`)
      if (cachedFixture) {
        return new Response(JSON.stringify(cachedFixture), {
          status: 200,
          headers: { 'content-type': 'application/json', 'x-data-source': 'live-cached' }
        })
      }
    } else {
      const cachedList = cacheGet('football-list')
      if (cachedList) {
        return new Response(JSON.stringify(cachedList), {
          status: 200,
          headers: { 'content-type': 'application/json', 'x-data-source': 'live-cached' }
        })
      }
    }

    let events = cacheGet('football-events')
    if (!events) {
      const results = await Promise.allSettled(
        SPORTS.map(async (sport) => {
          const apiUrl = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${apiKey}&regions=${REGION}&markets=${MARKETS}&oddsFormat=decimal&includeLinks=true`
          const res = await fetch(apiUrl)
          if (!res.ok) throw new Error(`${sport}: ${res.status}`)
          return res.json()
        })
      )

      events = results.filter((r) => r.status === 'fulfilled').flatMap((r) => r.value)
      // Provider errors (quota exhausted, outage, etc.) shouldn't turn into
      // a broken page for users - fall back to sample odds instead, same as
      // the no-API-key path. Logged server-side so it's still diagnosable.
      if (!events.length && results.every((r) => r.status === 'rejected')) {
        console.error('Odds provider error, falling back to mock:', results[0].reason?.message)
        return serveMock(id)
      }
      if (events.length) cacheSet('football-events', events, LIST_TTL)
    }

    if (!id) {
      const fixtures = events.map(reshapeEvent).sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff))
      cacheSet('football-list', fixtures, LIST_TTL)
      return new Response(JSON.stringify(fixtures), {
        status: 200,
        headers: { 'content-type': 'application/json', 'x-data-source': 'live' }
      })
    }

    const rawEvent = events.find((e) => e.id === id)
    if (!rawEvent) {
      return new Response(JSON.stringify(null), {
        status: 200,
        headers: { 'content-type': 'application/json', 'x-data-source': 'live' }
      })
    }

    const fixture = reshapeEvent(rawEvent)

    // Player props (goalscorer markets) aren't in the bulk endpoint above -
    // they need a separate per-event call (one more credit), and critically
    // The Odds API's soccer player-prop coverage is US-bookmaker-only, so
    // this must query regions=us regardless of REGION above or it always
    // comes back empty even when the market exists. Bookmakers also don't
    // post these until close to kickoff, so empty is normal for fixtures
    // that are still weeks out - never treated as an error either way.
    try {
      const playerMarketKeys = ['player_goal_scorer_anytime', 'player_first_goal_scorer', 'player_last_goal_scorer']
      const playerUrl = `https://api.the-odds-api.com/v4/sports/${rawEvent.sport_key}/events/${id}/odds/?apiKey=${apiKey}&regions=us&markets=${playerMarketKeys.join(',')}&oddsFormat=decimal&includeLinks=true`
      const playerRes = await fetch(playerUrl)
      if (playerRes.ok) {
        const playerEvent = await playerRes.json()
        fixture.markets.push(...reshapePlayerMarkets(playerEvent))
      }
    } catch {
      // Nice-to-have - never fail the whole fixture load over player props.
    }

    // Additional UK-bookmaker markets (BTTS, draw no bet, double chance),
    // same one-call-per-fixture treatment as player props above so the
    // bulk fixture list stays cheap.
    try {
      const extraMarketKeys = Object.keys(EXTRA_MARKET_LABELS)
      const extraUrl = `https://api.the-odds-api.com/v4/sports/${rawEvent.sport_key}/events/${id}/odds/?apiKey=${apiKey}&regions=${REGION}&markets=${extraMarketKeys.join(',')}&oddsFormat=decimal&includeLinks=true`
      const extraRes = await fetch(extraUrl)
      if (extraRes.ok) {
        const extraEvent = await extraRes.json()
        fixture.markets.push(...reshapeExtraMarkets(extraEvent))
      }
    } catch {
      // Nice-to-have - never fail the whole fixture load over extra markets.
    }

    cacheSet(`football-fixture-${id}`, fixture, DETAIL_TTL)
    return new Response(JSON.stringify(fixture), {
      status: 200,
      headers: { 'content-type': 'application/json', 'x-data-source': 'live' }
    })
  } catch (err) {
    console.error('Odds provider error, falling back to mock:', err.message)
    return serveMock(id)
  }
}

function reshapeEvent(event) {
  const marketDefs = [
    { key: 'h2h', label: '1X2' },
    { key: 'totals', label: 'Over/Under 2.5 Goals' }
  ]

  const markets = marketDefs
    .map(({ key, label }) => {
      const outcomesByName = new Map()
      for (const bookmaker of event.bookmakers ?? []) {
        const market = bookmaker.markets?.find((m) => m.key === key)
        if (!market) continue
        for (const outcome of market.outcomes) {
          const name = normaliseOutcomeName(outcome.name, event.home_team, event.away_team, key)
          if (!outcomesByName.has(name)) outcomesByName.set(name, [])
          outcomesByName.get(name).push({ bookmaker: bookmaker.title, decimal: outcome.price, ...pickLink(bookmaker, market, outcome) })
        }
      }
      const outcomes = [...outcomesByName.entries()].map(([name, allOdds]) => ({
        name,
        team: name === 'Home' ? event.home_team : name === 'Away' ? event.away_team : null,
        allOdds: allOdds.sort((a, b) => b.decimal - a.decimal),
        bestOdds: allOdds.reduce((a, b) => (b.decimal > a.decimal ? b : a))
      }))
      return outcomes.length ? { key, label, outcomes } : null
    })
    .filter(Boolean)

  return {
    id: event.id,
    competition: event.sport_title,
    homeTeam: event.home_team,
    awayTeam: event.away_team,
    kickoff: event.commence_time,
    status: 'scheduled',
    markets
  }
}

const PLAYER_MARKET_LABELS = {
  player_goal_scorer_anytime: 'Anytime Goalscorer',
  player_first_goal_scorer: 'First Goalscorer',
  player_last_goal_scorer: 'Last Goalscorer'
}

function reshapePlayerMarkets(event) {
  return Object.entries(PLAYER_MARKET_LABELS)
    .map(([key, label]) => {
      const outcomesByName = new Map()
      for (const bookmaker of event.bookmakers ?? []) {
        const market = bookmaker.markets?.find((m) => m.key === key)
        if (!market) continue
        for (const outcome of market.outcomes) {
          const name = outcome.description ?? outcome.name
          if (!name) continue
          if (!outcomesByName.has(name)) outcomesByName.set(name, [])
          outcomesByName.get(name).push({ bookmaker: bookmaker.title, decimal: outcome.price, ...pickLink(bookmaker, market, outcome) })
        }
      }
      const outcomes = [...outcomesByName.entries()].map(([name, allOdds]) => ({
        name,
        team: null,
        allOdds: allOdds.sort((a, b) => b.decimal - a.decimal),
        bestOdds: allOdds.reduce((a, b) => (b.decimal > a.decimal ? b : a))
      }))
      return outcomes.length ? { key, label, outcomes } : null
    })
    .filter(Boolean)
}

function normaliseOutcomeName(rawName, homeTeam, awayTeam, marketKey) {
  if (marketKey === 'h2h') {
    if (rawName === homeTeam) return 'Home'
    if (rawName === awayTeam) return 'Away'
    return 'Draw'
  }
  return rawName // "Over"/"Under" totals labels are already provider-clean
}

// 0.5 and 6.5+ lines are essentially guaranteed/impossible bets nobody
// actually wants - keep the alternate-lines list to the range people
// realistically consider instead of a wall of 14 rows.
const ALT_TOTALS_MIN_LINE = 1.5
const ALT_TOTALS_MAX_LINE = 4.5

function reshapeExtraMarkets(event) {
  return Object.entries(EXTRA_MARKET_LABELS)
    .map(([key, label]) => {
      const outcomesByName = new Map()
      for (const bookmaker of event.bookmakers ?? []) {
        const market = bookmaker.markets?.find((m) => m.key === key)
        if (!market) continue
        for (const outcome of market.outcomes) {
          if (key === 'alternate_totals' && (outcome.point < ALT_TOTALS_MIN_LINE || outcome.point > ALT_TOTALS_MAX_LINE)) continue
          // draw_no_bet is two-way (no draw outcome) so "Home"/"Away" reads
          // naturally with the team-badge UI; btts (Yes/No) and
          // double_chance (e.g. "Team A/Draw") are already clean labels;
          // alternate_totals needs the line folded into the name (multiple
          // Over/Under rows per market) or every line would collide into
          // one "Over" bucket.
          const name =
            key === 'draw_no_bet'
              ? normaliseOutcomeName(outcome.name, event.home_team, event.away_team, 'h2h')
              : key === 'alternate_totals'
                ? `${outcome.name} ${outcome.point}`
                : outcome.name
          if (!outcomesByName.has(name)) outcomesByName.set(name, [])
          outcomesByName.get(name).push({ bookmaker: bookmaker.title, decimal: outcome.price, ...pickLink(bookmaker, market, outcome) })
        }
      }
      const outcomes = [...outcomesByName.entries()]
        .map(([name, allOdds]) => ({
          name,
          team: name === 'Home' ? event.home_team : name === 'Away' ? event.away_team : null,
          allOdds: allOdds.sort((a, b) => b.decimal - a.decimal),
          bestOdds: allOdds.reduce((a, b) => (b.decimal > a.decimal ? b : a))
        }))
        .sort((a, b) => (key === 'alternate_totals' ? a.name.localeCompare(b.name, undefined, { numeric: true }) : 0))
      return outcomes.length ? { key, label, outcomes } : null
    })
    .filter(Boolean)
}
