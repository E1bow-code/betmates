import { GENERIC_SPORTS } from '../lib/sportsConfig.js'

// Decides whether a bet selection should show a crest (team) or headshot
// (player) next to it on a bet card, and which. It's deliberately
// conservative: a badge only helps when the selection IS a participant, so
// this returns null for anything where the selection is a line or an event
// rather than a team/fighter -
//   - non-participant sports (racing runners, pick-less posts, mixed multis)
//   - markets that aren't head-to-head (totals "Over 2.5", handicaps,
//     both-teams-to-score, correct score, goalscorer props...)
//   - the Draw outcome (a real h2h pick, but not a participant to badge)
// A wrong or initials-only badge on those reads worse than none, hence the
// gating rather than "always try and fall back to initials".
//
// Returns { type: 'team' | 'player', name, sport } or null.
const H2H_MARKET = /^(moneyline|money line|match result|match odds|result|winner|to win|fight winner|h2h|1x2|match winner)$/i

export function participantBadge(selection, postSport) {
  if (!selection) return null
  const sport = selection.sport ?? postSport
  if (!sport || sport === 'racing' || sport === 'multi' || sport === 'post') return null

  // football/ufc are hand-built (not in GENERIC_SPORTS); everything else
  // carries its participantType there.
  const type = sport === 'football' ? 'team' : sport === 'ufc' ? 'player' : GENERIC_SPORTS[sport]?.participantType
  if (type !== 'team' && type !== 'player') return null

  // An app-picked leg stamps marketKey 'h2h'; a hand-logged bet only has the
  // free-text market label, so fall back to matching common head-to-head names.
  const isH2H = selection.marketKey === 'h2h' || H2H_MARKET.test((selection.market ?? '').trim())
  if (!isH2H) return null

  const name = (selection.selection ?? '').trim()
  if (!name || /^draw$/i.test(name)) return null

  return { type, name, sport }
}
