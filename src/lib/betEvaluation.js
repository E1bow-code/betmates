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
// TrackerPage's manual "Placed (not won)" option already does. Only
// manual_entries can represent that reduced payout today, so a 'placed'
// result on a bet_post is left open rather than settled incorrectly.
function evaluateRacingLeg(leg, raceResults) {
  const race = raceResults?.find((r) => r.raceId === leg.raceId)
  if (!race) return 'undetermined'
  const runner = race.runners.find((r) => r.horseId === leg.horseId) ?? race.runners.find((r) => r.name === leg.selection)
  if (!runner) return 'undetermined'
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
  const outcomes = entry.selections.map((leg) => evaluateLeg(leg, games, raceResults))
  if (outcomes.some((o) => o === 'lost')) return 'lost'
  if (outcomes.some((o) => o === 'undetermined')) return null
  if (outcomes.some((o) => o === 'placed')) return 'placed'
  return outcomes.every((o) => o === 'void') ? 'void' : 'won'
}
