// UK bookmaker list + deep-link scheme map for the Copy Bet flow.
// Bookmakers without a known scheme degrade to copy-to-clipboard + a link
// to their homepage, per the brief's Section 2B stretch goal.

export const BOOKMAKERS = [
  'Bet365',
  'William Hill',
  'Paddy Power',
  'Sky Bet',
  'Betfair',
  'Ladbrokes',
  'Coral',
  'BetVictor',
  'Betway',
  'Unibet'
]

// Known URL schemes that support opening straight to the site/app.
// None of these pre-fill a selection today (few UK bookmakers expose that
// publicly) - they're the "open [Bookmaker]" fallback from Section 2B.
export const BOOKMAKER_LINKS = {
  Bet365: 'https://www.bet365.com',
  'William Hill': 'https://sports.williamhill.com',
  'Paddy Power': 'https://www.paddypower.com',
  'Sky Bet': 'https://www.skybet.com',
  Betfair: 'https://www.betfair.com',
  Ladbrokes: 'https://sports.ladbrokes.com',
  Coral: 'https://sports.coral.co.uk',
  BetVictor: 'https://www.betvictor.com',
  Betway: 'https://betway.com',
  Unibet: 'https://www.unibet.co.uk'
}

// Section 2B/8 stretch goal: pre-fill a bet slip via deep link instead of
// just opening the homepage. Deliberately EMPTY - no major UK bookmaker
// currently publishes a public, unauthenticated URL scheme for pre-filling
// a bet slip with an arbitrary selection (their slip state is normally
// tied to a logged-in session or an internal event ID we don't have).
// Making one up here would silently produce broken links, which is worse
// than the honest copy-to-clipboard fallback.
//
// If you get confirmation of a real scheme (e.g. from a bookmaker's
// affiliate/API documentation), add it here as
// BOOKMAKER_NAME: (selection) => 'https://...', where `selection` is
// { event, market, selection, odds, bookmaker }. buildDeepLink() below
// already wires it into the Copy Bet button with no other code changes.
export const DEEP_LINK_BUILDERS = {}

export function buildDeepLink(bookmaker, selection) {
  const builder = DEEP_LINK_BUILDERS[bookmaker]
  return builder ? builder(selection) : null
}
