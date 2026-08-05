// Shared by netlify/functions/odds.js, ufc.js, and sport.js - all three
// fetch from The Odds API with includeLinks=true and need the same
// fallback order picking whichever link The Odds API actually returned:
// a per-outcome link (a genuine pre-filled bet slip - currently only Sky
// Bet returns these) beats a market link, which beats the bookmaker's
// plain event page. isBetslipLink is only true for the outcome-level
// case, so the UI can honestly label what kind of link it actually got
// rather than calling every link a "bet slip".
export function pickLink(bookmaker, market, outcome) {
  const link = outcome.link ?? market.link ?? bookmaker.link ?? null
  return { link, isBetslipLink: Boolean(outcome.link) }
}
