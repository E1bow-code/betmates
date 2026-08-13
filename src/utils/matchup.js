import { GENERIC_SPORTS } from '../lib/sportsConfig.js'

// football and ufc are hand-built sports (see sportsConfig.js's file
// comment) so they never got a GENERIC_SPORTS entry - this fills in just
// the one field of theirs a face-off banner needs. Racing (many-runner
// field, no head-to-head) and 'multi' are deliberately absent so they
// resolve to undefined below.
const FALLBACK_PARTICIPANT_TYPE = { football: 'team', ufc: 'player' }

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

  const [nameA, nameB] = parts
  return { nameA, nameB, participantType }
}
