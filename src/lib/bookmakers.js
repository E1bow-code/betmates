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
  BetRivers: 'https://betrivers.com',
  // racing.js passes theracingapi.com's own bookmaker strings straight
  // through with no normalization (no pickLink() equivalent exists for
  // that provider - see racing.js's reshapeRunner), so these have to match
  // exactly, spacing included, even where a same-brand entry already
  // exists above under a differently-spaced key (e.g. "Bet Victor" here
  // vs "BetVictor" above, "Betfair Exchange" here vs "Betfair" above -
  // genuinely how each provider spells it, not a typo to consolidate).
  '7Bet': 'https://www.7bet.co.uk',
  BestOdds: 'https://www.bestodds.com/uk',
  'Bet Victor': 'https://www.betvictor.com',
  BetAhoy: 'https://betahoy.co.uk',
  BetTom: 'https://www.bettom.com',
  BetWright: 'https://betwright.com',
  Betano: 'https://www.betano.co.uk',
  'Betfair Exchange': 'https://www.betfair.com/exchange',
  Betfred: 'https://www.betfred.com',
  'Boyle Sports': 'https://www.boylesports.com',
  BresBet: 'https://www.bresbet.com',
  CopyBet: 'https://www.copybet.com',
  'Dragon Bet': 'https://dragonbet.uk.com',
  'LiveScore Bet': 'https://www.livescorebet.com',
  Midnite: 'https://www.midnite.com',
  Octobet: 'https://octobet.com',
  'PricedUp Bet': 'https://pricedup.bet',
  'Quinn Bet': 'https://quinnbet.com/uk',
  SmarketsSBK: 'https://smarkets.com',
  SportingIndex: 'https://www.sportingindex.com',
  Spreadex: 'https://www.spreadex.com',
  'Star Sports': 'https://starsports.bet',
  'Virgin Bet': 'https://www.virginbet.com',
  'talkSPORT BET': 'https://www.talksportbet.com'
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
