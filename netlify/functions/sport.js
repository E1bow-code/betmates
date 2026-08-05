// Generic proxy for every sport in src/lib/sportsConfig.js - one function
// instead of one-per-sport. `sport` query param selects the config entry;
// most sports go through The Odds API (h2h+totals, same credit cost as
// h2h alone since both are "featured" markets there), but the four
// SportsGameOdds-backed sports (see sportsConfig.js's `provider: 'sgo'`
// comment) go through a completely different API with its own shape -
// real per-bookmaker odds and deep links, separate free quota, better
// suited to US sports than querying UK bookmakers ever was. Caching (see
// src/lib/apiCache.js) applies to both paths - same "stay on the free
// tier" goal either way.

import { GENERIC_SPORTS } from '../../src/lib/sportsConfig.js'
import { cacheGet, cacheSet } from '../../src/lib/apiCache.js'
import { pickLink } from '../../src/lib/oddsLinks.js'

const REGION = 'uk'
const MARKETS = 'h2h,totals'
// Tennis is the one GENERIC_SPORTS entry still on The Odds API's 500
// req/month tier (see odds.js's comment) - cached hard for the same reason.
const LIST_TTL = 20 * 60 * 1000
const TENNIS_KEYS_TTL = 30 * 60 * 1000
// SportsGameOdds' own docs say odds refresh ~every 10 min server-side, so
// there's no freshness lost by caching longer than that - cached hard
// against the free tier's 2,500 objects/month budget.
const SGO_TTL = 15 * 60 * 1000

export default async (req) => {
  const url = new URL(req.url)
  const sportParam = url.searchParams.get('sport')
  const id = url.searchParams.get('id')
  const config = GENERIC_SPORTS[sportParam]

  if (!config) {
    return new Response(JSON.stringify({ error: `Unknown sport: ${sportParam}` }), {
      status: 400,
      headers: { 'content-type': 'application/json' }
    })
  }

  const emptyResponse = (dataSource) =>
    new Response(JSON.stringify(id ? null : []), {
      status: 200,
      headers: { 'content-type': 'application/json', 'x-data-source': dataSource }
    })

  if (config.provider === 'sgo') {
    const sgoApiKey = process.env.SGO_API_KEY
    if (!sgoApiKey) return emptyResponse('mock')

    try {
      let items = cacheGet(`sport-items-${sportParam}`)
      if (!items) {
        items = await fetchSgoItems(sgoApiKey, config)
        cacheSet(`sport-items-${sportParam}`, items, SGO_TTL)
      }
      const body = id ? items.find((i) => i.id === id) ?? null : items
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json', 'x-data-source': 'live' }
      })
    } catch (err) {
      console.error('SportsGameOdds error, degrading to empty:', err.message)
      return emptyResponse('live-empty')
    }
  }

  const apiKey = process.env.ODDS_API_KEY
  if (!apiKey) return emptyResponse('mock')

  try {
    let items = cacheGet(`sport-items-${sportParam}`)
    if (!items) {
      // /v4/sports listing is free (doesn't cost quota) - used to resolve
      // which tennis_* tournament keys are actually live right now instead
      // of a hardcoded list (see sportsConfig.js's dynamicPrefix comment).
      // Still cached to avoid a network round-trip every request.
      const apiSportKeys = config.dynamicPrefix
        ? await (async () => {
            const cachedKeys = cacheGet(`tennis-keys-${config.dynamicPrefix}`)
            if (cachedKeys) return cachedKeys
            const keys = await fetch(`https://api.the-odds-api.com/v4/sports/?apiKey=${apiKey}`)
              .then((r) => (r.ok ? r.json() : []))
              .then((sports) => sports.filter((s) => s.active && s.key.startsWith(config.dynamicPrefix)).map((s) => s.key))
              .catch(() => [])
            if (keys.length) cacheSet(`tennis-keys-${config.dynamicPrefix}`, keys, TENNIS_KEYS_TTL)
            return keys
          })()
        : config.apiSportKeys

      if (!apiSportKeys.length) return emptyResponse('live-empty')

      const results = await Promise.allSettled(
        apiSportKeys.map(async (apiSport) => {
          const apiUrl = `https://api.the-odds-api.com/v4/sports/${apiSport}/odds/?apiKey=${apiKey}&regions=${REGION}&markets=${MARKETS}&oddsFormat=decimal&includeLinks=true`
          const res = await fetch(apiUrl)
          if (!res.ok) throw new Error(`${apiSport}: ${res.status}`)
          return res.json()
        })
      )

      const events = results.filter((r) => r.status === 'fulfilled').flatMap((r) => r.value)
      // Provider errors (quota exhausted, outage, etc.) degrade to an empty
      // board rather than an error page - there's no per-sport mock data to
      // fall back to here, but "nothing on right now" is a state the UI
      // already handles fine.
      if (!events.length && results.every((r) => r.status === 'rejected')) {
        console.error('Odds provider error, degrading to empty:', results[0].reason?.message)
        return emptyResponse('live-empty')
      }

      items = events.map((e) => reshapeEvent(e, config)).sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff))
      cacheSet(`sport-items-${sportParam}`, items, LIST_TTL)
    }

    const body = id ? items.find((i) => i.id === id) ?? null : items
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json', 'x-data-source': 'live' }
    })
  } catch (err) {
    console.error('Odds provider error, degrading to empty:', err.message)
    return emptyResponse('live-empty')
  }
}

function reshapeEvent(event, config) {
  const h2hOutcomes = groupOutcomes(event, 'h2h', (outcome) =>
    normaliseOutcomeName(outcome.name, event.home_team, event.away_team, config.hasDraw)
  )
  // Totals lines vary per event (an NBA total isn't the same number as an
  // NHL total, and even differs game to game), so the line has to travel
  // with the outcome name rather than a static market label like
  // football's "Over/Under 2.5 Goals" - "Over 224.5" is the whole pick.
  const totalsOutcomes = groupOutcomes(event, 'totals', (outcome) => `${outcome.name} ${outcome.point ?? ''}`.trim())

  const markets = []
  if (h2hOutcomes.length) markets.push({ key: 'h2h', label: 'Moneyline', outcomes: h2hOutcomes })
  if (totalsOutcomes.length) markets.push({ key: 'totals', label: 'Total Points', outcomes: totalsOutcomes })

  return {
    id: event.id,
    competition: event.sport_title,
    participantA: event.home_team,
    participantB: event.away_team,
    kickoff: event.commence_time,
    status: 'scheduled',
    markets
  }
}

function groupOutcomes(event, marketKey, nameFor) {
  const outcomesByName = new Map()
  for (const bookmaker of event.bookmakers ?? []) {
    const market = bookmaker.markets?.find((m) => m.key === marketKey)
    if (!market) continue
    for (const outcome of market.outcomes) {
      const name = nameFor(outcome)
      if (!outcomesByName.has(name)) outcomesByName.set(name, [])
      outcomesByName.get(name).push({ bookmaker: bookmaker.title, decimal: outcome.price, ...pickLink(bookmaker, market, outcome) })
    }
  }
  return [...outcomesByName.entries()].map(([name, allOdds]) => ({
    name,
    team: name === 'Home' ? event.home_team : name === 'Away' ? event.away_team : null,
    allOdds: allOdds.sort((a, b) => b.decimal - a.decimal),
    bestOdds: allOdds.reduce((a, b) => (b.decimal > a.decimal ? b : a))
  }))
}

function normaliseOutcomeName(rawName, homeTeam, awayTeam, hasDraw) {
  if (rawName === homeTeam) return 'Home'
  if (rawName === awayTeam) return 'Away'
  return hasDraw ? 'Draw' : rawName
}

// --- SportsGameOdds -----------------------------------------------------

const SGO_BASE = 'https://api.sportsgameodds.com/v2'

const SGO_BOOKMAKER_LABELS = {
  fanduel: 'FanDuel',
  draftkings: 'DraftKings',
  betmgm: 'BetMGM',
  caesars: 'Caesars',
  espnbet: 'ESPN BET',
  bovada: 'Bovada',
  pointsbet: 'PointsBet',
  unibet: 'Unibet',
  williamhill: 'William Hill',
  ballybet: 'Bally Bet',
  hardrockbet: 'Hard Rock Bet',
  betrivers: 'BetRivers',
  fliff: 'Fliff'
}

function sgoBookmakerLabel(id) {
  return SGO_BOOKMAKER_LABELS[id] ?? id.charAt(0).toUpperCase() + id.slice(1)
}

// SportsGameOdds quotes American odds ("+130", "-150"); the rest of the
// app assumes decimal throughout (outcome.price, bestOdds.decimal etc.).
function americanToDecimal(american) {
  const n = Number(american)
  if (!Number.isFinite(n) || n === 0) return null
  return Math.round((n > 0 ? 1 + n / 100 : 1 + 100 / Math.abs(n)) * 100) / 100
}

async function fetchSgoItems(sgoApiKey, config) {
  const apiUrl = `${SGO_BASE}/events?leagueID=${config.leagueID}&oddsAvailable=true&limit=25&apiKey=${sgoApiKey}`
  const res = await fetch(apiUrl)
  if (!res.ok) throw new Error(`SportsGameOdds ${config.leagueID}: ${res.status}`)
  const body = await res.json()
  const events = body.data ?? []
  return events.map(reshapeSgoEvent).sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff))
}

function reshapeSgoEvent(event) {
  const homeName = event.teams?.home?.names?.long
  const awayName = event.teams?.away?.names?.long

  const h2hOutcomes = groupSgoOutcomes(event, 'ml', homeName, awayName, (odd) =>
    odd.sideID === 'home' ? 'Home' : odd.sideID === 'away' ? 'Away' : null
  )
  const totalsOutcomes = groupSgoOutcomes(event, 'ou', homeName, awayName, (odd) => {
    if (odd.statEntityID !== 'all' || (odd.sideID !== 'over' && odd.sideID !== 'under')) return null
    const line = odd.bookOverUnder ?? odd.fairOverUnder
    return line ? `${odd.sideID === 'over' ? 'Over' : 'Under'} ${line}` : null
  })
  // Spread outcome names bake in the team + signed line ("Phillies -1.5")
  // rather than the bare "Home"/"Away" moneyline uses, same reasoning as
  // totals above - the line is the pick, not just which team.
  const spreadOutcomes = groupSgoOutcomes(
    event,
    'sp',
    homeName,
    awayName,
    (odd) => {
      if (odd.sideID !== 'home' && odd.sideID !== 'away') return null
      const teamName = odd.sideID === 'home' ? homeName : awayName
      // bookSpread already comes back sign-prefixed ("+1.5"/"-1.5") -
      // adding another "+" here doubled up as "++1.5".
      const line = odd.bookSpread ?? odd.fairSpread
      if (!teamName || line == null) return null
      return `${teamName} ${line}`
    },
    (odd) => (odd.sideID === 'home' ? homeName : odd.sideID === 'away' ? awayName : null)
  )

  const markets = []
  if (h2hOutcomes.length) markets.push({ key: 'h2h', label: 'Moneyline', outcomes: h2hOutcomes })
  if (spreadOutcomes.length) markets.push({ key: 'spreads', label: 'Spread', outcomes: spreadOutcomes })
  if (totalsOutcomes.length) markets.push({ key: 'totals', label: 'Total Points', outcomes: totalsOutcomes })

  return {
    id: event.eventID,
    competition: event.leagueID,
    participantA: homeName,
    participantB: awayName,
    kickoff: event.status?.startsAt,
    status: 'scheduled',
    markets
  }
}

// One event carries every market as a flat oddID -> detail map (game,
// period, and prop markets all mixed together) - betTypeID + periodID
// pick out just the game-level moneyline/spread/totals entries this app
// shows. Each entry's own byBookmaker prices can quote a slightly
// different line than the consensus (bookOverUnder/bookSpread) - only
// bookmakers matching the consensus line are included, so "Over 224.5"
// (or "Phillies -1.5") doesn't silently compare against someone else's
// different line. `teamFor` is only needed for spread (its outcome name
// bakes in the line, so it can't double as the Home/Away lookup the way
// moneyline/totals names do) - defaults to the same Home/Away inference
// those two already relied on.
function groupSgoOutcomes(event, betTypeID, homeName, awayName, nameFor, teamFor) {
  const lineField = betTypeID === 'ou' ? 'overUnder' : betTypeID === 'sp' ? 'spread' : null
  const outcomesByName = new Map()
  for (const odd of Object.values(event.odds ?? {})) {
    if (odd.betTypeID !== betTypeID || odd.periodID !== 'game') continue
    const name = nameFor(odd)
    if (!name) continue
    const team = teamFor ? teamFor(odd) : name === 'Home' ? homeName : name === 'Away' ? awayName : null
    const consensusLine = odd.bookOverUnder ?? odd.bookSpread ?? null
    for (const [bookmakerId, bm] of Object.entries(odd.byBookmaker ?? {})) {
      if (!bm.available || bm.odds == null) continue
      const bmLine = lineField ? bm[lineField] : null
      if (consensusLine != null && bmLine != null && bmLine !== consensusLine) continue
      const decimal = americanToDecimal(bm.odds)
      if (!decimal) continue
      if (!outcomesByName.has(name)) outcomesByName.set(name, { team, odds: [] })
      outcomesByName.get(name).odds.push({ bookmaker: sgoBookmakerLabel(bookmakerId), decimal })
    }
  }
  return [...outcomesByName.entries()]
    .map(([name, { team, odds: allOdds }]) => ({
      name,
      team,
      allOdds: allOdds.sort((a, b) => b.decimal - a.decimal),
      bestOdds: allOdds.reduce((a, b) => (b.decimal > a.decimal ? b : a))
    }))
    .filter((o) => o.allOdds.length)
}
