// Pure reshaping of The Odds API's football payload into the
// { id, competition, homeTeam, awayTeam, kickoff, markets: [...] } shape the
// UI and src/data/mockFootballOdds.js use. Extracted out of
// netlify/functions/odds.js so it can be shared with
// netlify/functions/odds-ingest.js (the scheduled job that pre-populates the
// odds_cache table): the on-demand proxy and the cron have to produce the
// byte-identical shape, so - exactly like src/lib/betEvaluation.js is the one
// place settlement rules live - this is the one place the odds shape lives.
// No I/O in here (only pickLink, itself pure) so a Netlify Function can import
// it straight out of src/lib.
import { pickLink } from './oddsLinks.js'

export const EXTRA_MARKET_LABELS = {
  btts: 'Both Teams to Score',
  draw_no_bet: 'Draw No Bet',
  double_chance: 'Double Chance',
  alternate_totals: 'Alternate Total Goals'
}

const PLAYER_MARKET_LABELS = {
  player_goal_scorer_anytime: 'Anytime Goalscorer',
  player_first_goal_scorer: 'First Goalscorer',
  player_last_goal_scorer: 'Last Goalscorer'
}

// 0.5 and 6.5+ lines are essentially guaranteed/impossible bets nobody
// actually wants - keep the alternate-lines list to the range people
// realistically consider instead of a wall of 14 rows.
const ALT_TOTALS_MIN_LINE = 1.5
const ALT_TOTALS_MAX_LINE = 4.5

export function reshapeEvent(event) {
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
    sportKey: event.sport_key,
    homeTeam: event.home_team,
    awayTeam: event.away_team,
    kickoff: event.commence_time,
    status: 'scheduled',
    markets
  }
}

export function reshapePlayerMarkets(event) {
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

export function reshapeExtraMarkets(event) {
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
