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
  Unibet: 'https://www.unibet.co.uk',
  // The basketball/hockey/baseball/NFL bookmaker set (SGO_BOOKMAKER_LABELS
  // in netlify/functions/sport.js) is otherwise-disjoint from the UK list
  // above - without these, Copy Bet on those four sports had no fallback
  // at all once a leg's per-selection deeplink wasn't available.
  FanDuel: 'https://sportsbook.fanduel.com',
  DraftKings: 'https://sportsbook.draftkings.com',
  BetMGM: 'https://sports.betmgm.com',
  Caesars: 'https://www.caesars.com/sportsbook-and-casino',
  'ESPN BET': 'https://espnbet.com',
  Bovada: 'https://www.bovada.lv',
  PointsBet: 'https://pointsbet.com',
  'Bally Bet': 'https://ballybet.com',
  'Hard Rock Bet': 'https://app.hardrock.bet',
  BetRivers: 'https://betrivers.com'
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

// Affiliate tracking parameters, appended to WHATEVER link a Copy Bet ends up
// opening - including the deep event/bet-slip links The Odds API returns
// (includeLinks, see oddsLinks.js), which are the highest-intent clicks and
// until now went out untracked because VITE_AFFILIATE_LINKS only swaps the
// homepage fallback. Most UK programs track by a tag appended to any landing
// URL on their own domain (btag/affid/etc.), so this captures commission on
// the click that actually matters. JSON map of bookmaker -> query string,
// e.g. {"Bet365":"affiliate=12345","Sky Bet":"aff_id=abc"} - only the
// bookmakers you've signed up with need an entry. Programs that instead use a
// redirect-wrapper URL keep using VITE_AFFILIATE_LINKS for that.
let AFFILIATE_PARAMS = {}
try {
  AFFILIATE_PARAMS = JSON.parse(import.meta.env.VITE_AFFILIATE_PARAMS || '{}')
} catch {
  // Same graceful degradation as the links above - a malformed value just
  // means links go out with no tracking param, exactly as before.
}

// Appends the bookmaker's affiliate tracking param to a resolved URL. No-ops
// when there's no url or no configured param, and won't double-append if the
// param key is already on the URL (so an affiliate homepage link that already
// carries its tag isn't corrupted).
export function withAffiliate(bookmaker, url) {
  const param = AFFILIATE_PARAMS[bookmaker]
  if (!url || !param) return url
  const key = param.split('=')[0]
  if (key && new RegExp(`[?&]${key}=`).test(url)) return url
  return url + (url.includes('?') ? '&' : '?') + param
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
