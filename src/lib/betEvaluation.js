// Pure score-vs-selection evaluation, no I/O - shared by src/lib/settlement.js
// (client-triggered, on a Tracker visit) and netlify/functions/auto-settle.js
// (scheduled, runs without anyone visiting). Keeping this side-effect-free is
// what lets a Netlify Function import straight from src/lib like the client
// bundle does, instead of maintaining two copies of the same rules.
//
// Only markets whose outcome can be read straight off a final score are
// handled here (1X2/moneyline, totals, both teams to score, draw no bet);
// goalscorer props, double chance, boxing/UFC, and horse racing can't be
// determined from a score line alone and keep the manual "Mark result"
// fallback in the UI.

export function findGame(leg, games) {
  return games.find((g) => leg.event === `${g.homeTeam} v ${g.awayTeam}`)
}

// 'won' | 'lost' | 'void' | 'undetermined' (game not finished/found yet, or
// the market isn't one of the settleable shapes below).
export function evaluateLeg(leg, games) {
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
// nothing is left outstanding.
export function evaluateEntry(entry, games) {
  const outcomes = entry.selections.map((leg) => evaluateLeg(leg, games))
  if (outcomes.some((o) => o === 'lost')) return 'lost'
  if (outcomes.some((o) => o === 'undetermined')) return null
  return outcomes.every((o) => o === 'void') ? 'void' : 'won'
}
