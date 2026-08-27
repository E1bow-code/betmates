import { GENERIC_SPORTS } from '../lib/sportsConfig.js'

// football and ufc are hand-built sports (see sportsConfig.js's file
// comment) so they never got a GENERIC_SPORTS entry - this fills in just
// the two fields a face-off banner needs. Racing (many-runner field, no
// head-to-head) and 'multi' are deliberately absent so they resolve to
// undefined below.
const FALLBACK_PARTICIPANT_TYPE = { football: 'team', ufc: 'player' }
// Same shape as GENERIC_SPORTS' hasDraw - football's 1X2 market has a real
// Draw outcome; UFC's Moneyline (like boxing's, already false in
// GENERIC_SPORTS) never offers one.
const FALLBACK_HAS_DRAW = { football: true, ufc: false }

// A saved bet leg only stores its two competitors pre-joined into one
// string ("Ian Garry v Islam Makhachev") - see FightDetailPage.jsx's
// `${fight.fighterA} v ${fight.fighterB}` and the equivalent for football/
// generic fixtures. Splitting on ' v ' mirrors betEvaluation.js's
// findGame() fallback matcher, which already relies on the same delimiter
// to recover team names for settlement, so this isn't a new convention.
export function parseMatchup(leg) {
  const participantType = GENERIC_SPORTS[leg?.sport]?.participantType ?? FALLBACK_PARTICIPANT_TYPE[leg?.sport]
  if (!participantType) return null

  const parts = String(leg.event ?? '')
    .split(' v ')
    .map((s) => s.trim())
    .filter(Boolean)
  if (parts.length !== 2) return null

  const hasDraw = GENERIC_SPORTS[leg.sport]?.hasDraw ?? FALLBACK_HAS_DRAW[leg.sport] ?? false
  const [nameA, nameB] = parts
  return { nameA, nameB, participantType, hasDraw }
}

// Which side of the face-off actually won, for the settled-result treatment
// on MatchupBanner - deliberately returns null (no guess) rather than ever
// asserting a wrong winner:
//  - bet isn't settled yet (open) or was voided - no result to show
//  - the sport's market can draw (football 1X2, rugby, cricket) - a 'lost'
//    leg could mean the other side won OR a draw, and there's no score
//    data at this layer to tell the two apart
//  - the leg's own selection text doesn't match either face-off name at
//    all (a totals/handicap/BTTS pick, not a side) - nothing to highlight
export function resolveMatchupWinner(leg, matchup, status) {
  if (!matchup || matchup.hasDraw) return null
  if (status !== 'won' && status !== 'lost') return null
  const pick = leg?.selection
  if (pick !== matchup.nameA && pick !== matchup.nameB) return null
  if (status === 'won') return pick
  // status === 'lost' and no draw is possible, so the other side won.
  return pick === matchup.nameA ? matchup.nameB : matchup.nameA
}
