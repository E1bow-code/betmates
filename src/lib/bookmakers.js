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

// Plain homepage links - the default for every bookmaker until an
// affiliate tracking link is configured for it (see AFFILIATE_LINKS below).
const HOMEPAGE_LINKS = {
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

// Real affiliate tracking links, once you have them, go here - one Netlify
// env var, no further deploys or code changes needed. VITE_AFFILIATE_LINKS
// is a JSON object of exactly the shape HOMEPAGE_LINKS uses above, e.g.
// {"Bet365":"https://www.bet365affiliates.com/redirect?id=XXXXX"} - only
// the bookmakers you've actually signed up with need an entry; anything
// missing just keeps using its plain homepage link. See .env.example for
// where each program in BOOKMAKERS currently signs up.
//
// This app never places a bet or touches a stake - Copy Bet's whole job is
// getting the user to the bookmaker's own site to place it themselves (see
// the legal page) - so an affiliate link here is just standard referral
// tracking on an outbound link, not a change to what the app does.
let AFFILIATE_LINKS = {}
try {
  AFFILIATE_LINKS = JSON.parse(import.meta.env.VITE_AFFILIATE_LINKS || '{}')
} catch {
  // Malformed env var shouldn't break the app - falls back to homepage
  // links for everything, same as if it were unset.
}

export const BOOKMAKER_LINKS = { ...HOMEPAGE_LINKS, ...AFFILIATE_LINKS }

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
