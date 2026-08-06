import { computeEachWayReturn } from '../utils/eachWay.js'

// Pure score-vs-selection evaluation, no I/O - shared by src/lib/settlement.js
// (client-triggered, on a Tracker visit) and netlify/functions/auto-settle.js
// (scheduled, runs without anyone visiting). Keeping this side-effect-free is
// what lets a Netlify Function import straight from src/lib like the client
// bundle does, instead of maintaining two copies of the same rules.
//
// Team-sport markets (1X2/moneyline, totals, both teams to score, draw no
// bet) are read straight off a final score. Horse racing is evaluated
// against The Racing API's finishing positions instead (see
// evaluateRacingLeg below) - matched by raceId/horseId rather than a team
// name string, since a course name alone isn't a reliable key. Goalscorer
// props, double chance, and boxing/UFC still can't be determined
// automatically and keep the manual "Mark result" fallback in the UI.

export function findGame(leg, games) {
  return games.find((g) => leg.event === `${g.homeTeam} v ${g.awayTeam}`)
}

// Distinct from 'won'/'lost': an each-way leg whose horse placed but didn't
// win. Not a real status the DB accepts (see supabase/schema.sql's check
// constraint) - callers settle it as 'won' with potentialReturn corrected
// down to the place-part payout (src/utils/eachWay.js), the same way
// TrackerPage's manual "Placed (not won)" option already does. bet_posts and
// manual_entries share the same status/potential_return shape, so both
// settle paths apply this the same way regardless of which table the entry
// came from.

// A race that never shows up in results (abandoned meeting, waterlogged
// track, etc.) doesn't get flagged as such anywhere the results endpoint
// exposes - it just silently never appears. Results are published within
// minutes of a race finishing, so once a leg's kickoff is this far in the
// past with still no matching result, an abandoned race is by far the most
// likely explanation - void it rather than leaving it "pending" forever.
const ABANDONED_GRACE_MS = 6 * 60 * 60 * 1000

function evaluateRacingLeg(leg, raceResults) {
  // A leg placed before raceId/horseId were tracked on the leg (or copied
  // through some path that dropped them) can never match a real race -
  // without this guard it would eventually hit the abandoned-race timeout
  // below and get auto-voided regardless of its real outcome. Falling back
  // to manual settling here is the same behaviour this bet already had
  // before auto-settlement for racing existed at all.
  if (!leg.raceId) return 'undetermined'
  const race = raceResults?.find((r) => r.raceId === leg.raceId)
  if (!race) {
    if (leg.kickoff && Date.now() - new Date(leg.kickoff).getTime() > ABANDONED_GRACE_MS) return 'void'
    return 'undetermined'
  }
  const runner = race.runners.find((r) => r.horseId === leg.horseId) ?? race.runners.find((r) => r.name === leg.selection)
  // The race has a confirmed result but this horse isn't among the
  // finishers - a withdrawn/non-runner, not missing data (results only
  // ever lists horses that actually ran, even ones pulled up or fallen).
  // No need to wait this one out like the whole-race case above: the
  // result is already in, so void it now (stake back, standard
  // non-runner-no-bet convention) rather than treating it as pending.
  if (!runner) return 'void'
  if (runner.position === 1) return 'won'
  if (leg.eachWay && runner.position != null && runner.position <= leg.eachWayPlaces) return 'placed'
  return 'lost'
}

// 'won' | 'lost' | 'placed' | 'void' | 'undetermined' (game/race not
// finished or found yet, or the market isn't one of the settleable shapes
// below).
export function evaluateLeg(leg, games, raceResults) {
  if (leg.sport === 'racing') return evaluateRacingLeg(leg, raceResults)
  const game = findGame(leg, games)
  if (!game) return 'undetermined'
  const homeScore = game.scores.find((s) => s.name === game.homeTeam)?.score
  const awayScore = game.scores.find((s) => s.name === game.awayTeam)?.score
  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return 'undetermined'

  if (leg.market === '1X2' || leg.market === 'Moneyline') {
    const winner = homeScore > awayScore ? game.homeTeam : awayScore > homeScore ? game.awayTeam : 'Draw'
    return leg.selection === winner ? 'won' : 'lost'
  }

  // Football's totals label always names the 2.5 line explicitly; the
  // generic-sports totals label carries its line inside the outcome name
  // itself (e.g. "Over 224.5"), which is also what ends up as
  // leg.selection - either way the line to check against is the number in
  // whichever string actually has it.
  const lineMatch = (leg.market.match(/Over\/Under ([\d.]+)/) ?? leg.selection.match(/([\d.]+)/)) ?? null
  if (lineMatch && /^(Over|Under)\b/.test(leg.selection)) {
    const line = Number(lineMatch[1])
    const total = homeScore + awayScore
    const isOver = total > line
    if (total === line) return 'void'
    return (leg.selection.startsWith('Over') && isOver) || (leg.selection.startsWith('Under') && !isOver) ? 'won' : 'lost'
  }

  if (leg.market === 'Both Teams to Score') {
    const btts = homeScore > 0 && awayScore > 0
    return (leg.selection === 'Yes' && btts) || (leg.selection === 'No' && !btts) ? 'won' : 'lost'
  }

  if (leg.market === 'Draw No Bet') {
    if (homeScore === awayScore) return 'void'
    const winner = homeScore > awayScore ? game.homeTeam : game.awayTeam
    return leg.selection === winner ? 'won' : 'lost'
  }

  return 'undetermined'
}

// Standard accumulator rule: any confirmed loser sinks the whole bet
// immediately (no need to wait on other legs); otherwise every leg needs
// to be resolved, void legs don't block a win, and it's a win only once
// nothing is left outstanding. 'placed' only ever shows up here for a
// single-leg each-way bet (the only shape BetBuilderSheet allows each-way
// on), so it never has to compete with other legs' outcomes.
export function evaluateEntry(entry, games, raceResults) {
  return evaluateEntryDetailed(entry, games, raceResults).status
}

// Same rules as evaluateEntry, but keeps the per-leg outcomes so callers can
// re-price a winning multi that contains a void leg (see voidAdjustedReturn).
export function evaluateEntryDetailed(entry, games, raceResults) {
  const outcomes = entry.selections.map((leg) => evaluateLeg(leg, games, raceResults))
  if (outcomes.some((o) => o === 'lost')) return { status: 'lost', outcomes }
  if (outcomes.some((o) => o === 'undetermined')) return { status: null, outcomes }
  if (outcomes.some((o) => o === 'placed')) return { status: 'placed', outcomes }
  return { status: outcomes.every((o) => o === 'void') ? 'void' : 'won', outcomes }
}

// A void leg in an otherwise-winning multi doesn't sink the bet, but it must
// not be paid on either - the standard bookmaker rule is to set that leg to
// odds 1.00 and re-price the accumulator, so the punter gets the rest of the
// multi at its real price. The stored potentialReturn was computed at bet
// time from every leg (see BetBuilderSheet), so without this correction a
// postponed fixture or a non-runner pays out as if it had won.
//
// Returns undefined when there's nothing to correct (no void legs, or the
// whole bet voided and the stake just comes back), which is exactly the
// "leave potential_return alone" signal both settle paths already use.
export function voidAdjustedReturn(entry, outcomes) {
  if (!outcomes.some((o) => o === 'void')) return undefined
  if (outcomes.every((o) => o === 'void')) return undefined
  if (!Number.isFinite(Number(entry.stake))) return undefined
  const odds = entry.selections.reduce((acc, leg, i) => (outcomes[i] === 'void' ? acc : acc * Number(leg.odds)), 1)
  if (!Number.isFinite(odds)) return undefined
  return Math.round(Number(entry.stake) * odds * 100) / 100
}

// Turns an evaluateEntryDetailed() result into what to actually write on
// settlement: the DB status plus any potentialReturn correction (void-leg
// re-pricing or an each-way place). Pure, and deliberately table-agnostic -
// bet_posts and manual_entries share the same status/potential_return
// columns (see supabase/schema.sql), so this is the one place that decides
// the payout for both, rather than settlement.js and auto-settle.js each
// hand-rolling their own copy of this branching and risking the two
// disagreeing. Returns null when there's nothing to settle yet
// (evaluateEntryDetailed found an undetermined leg).
export function resolveSettlement(entry, { status, outcomes }) {
  if (!status) return null
  if (status === 'placed') {
    const leg = entry.selections[0]
    const terms = { fraction: leg.eachWayFraction, places: leg.eachWayPlaces }
    return { status: 'won', potentialReturnOverride: Math.round(computeEachWayReturn(entry.stake, leg.odds, terms, 'place') * 100) / 100 }
  }
  return { status, potentialReturnOverride: status === 'won' ? voidAdjustedReturn(entry, outcomes) : undefined }
}
