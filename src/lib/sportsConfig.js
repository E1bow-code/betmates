// Shared by the client (src/api/genericSportsClient.js, src/pages/*) and
// the server (netlify/functions/sport.js) - adding a new head-to-head
// sport is a matter of adding one entry here, nothing else. Sports with a
// fundamentally different shape (Golf/outright winners, Tennis brackets,
// racing's many-runner field) aren't generic and stay as their own
// hand-built pages (see racingClient.js, oddsClient.js/football which also
// has extra goalscorer-prop handling, ufcClient.js).
//
// participantType controls which photo component the UI uses:
// 'team' -> TeamBadge (crest lookup), 'player' -> PlayerPhoto (headshot
// lookup). hasDraw controls whether a third "Draw" outcome is expected
// (cricket Tests, rugby, soccer) vs strictly a two-way market.

// Shared with netlify/functions/odds.js and ufc.js (which have their own
// hand-built pages, not the generic one above) so the settlement logic in
// src/lib/settlement.js can ask The Odds API's /scores endpoint about
// exactly the same sport keys the odds side already fetches, without
// duplicating the list in three places.
export const FOOTBALL_SPORT_KEYS = [
  'soccer_epl',
  'soccer_efl_champ',
  'soccer_scotland_premiership',
  'soccer_uefa_champs_league',
  'soccer_usa_mls'
]
export const UFC_SPORT_KEY = 'mma_mixed_martial_arts'

export const GENERIC_SPORTS = {
  // The Odds API doesn't have a year-round "tennis_atp" tour key like the
  // soccer leagues below - tennis is keyed per tournament (majors, but also
  // every ATP/WTA 250/500/Masters event), and which ones are live rotates
  // week to week, so there's no fixed list to hardcode here. dynamicPrefix
  // tells netlify/functions/sport.js to look up whatever tennis_* keys are
  // currently active via The Odds API's free /sports listing endpoint
  // instead of using apiSportKeys.
  tennis: { label: 'Tennis', dynamicPrefix: 'tennis_', participantType: 'player', hasDraw: false },
  // These four run through SportsGameOdds (netlify/functions/sport.js
  // branches on `provider`) instead of The Odds API - separate free
  // quota, and better-suited coverage for US sports than querying UK
  // bookmakers for them ever was. provider/leagueID replace apiSportKeys;
  // settlement/live-scores/results-archive read these through
  // sgoEventIdForLeg() below instead of apiKeysForSport() - SportsGameOdds
  // has no sport-wide /scores sweep, so those three ask about the specific
  // event a leg was struck on (leg.eventId) rather than a fetch window.
  basketball: { label: 'Basketball', provider: 'sgo', leagueID: 'NBA', participantType: 'team', hasDraw: false },
  hockey: { label: 'Ice Hockey', provider: 'sgo', leagueID: 'NHL', participantType: 'team', hasDraw: false },
  baseball: { label: 'Baseball', provider: 'sgo', leagueID: 'MLB', participantType: 'team', hasDraw: false },
  nfl: { label: 'NFL', provider: 'sgo', leagueID: 'NFL', participantType: 'team', hasDraw: false },
  rugbyLeague: { label: 'Rugby League', apiSportKeys: ['rugbyleague_nrl'], participantType: 'team', hasDraw: true },
  rugbyUnion: { label: 'Rugby Union', apiSportKeys: ['rugbyunion_six_nations'], participantType: 'team', hasDraw: true },
  cricket: {
    label: 'Cricket',
    apiSportKeys: ['cricket_international_t20', 'cricket_ipl', 'cricket_big_bash', 'cricket_the_hundred', 'cricket_t20_blast'],
    participantType: 'team',
    hasDraw: true
  },
  boxing: { label: 'Boxing', apiSportKeys: ['boxing_boxing'], participantType: 'player', hasDraw: false }
}

// The three hand-built sports (see file comment above) plus every generic
// one, keyed the same way bet_posts/manual_entries.sport is stored - one
// place for anything that needs a sport's display label (OddsListPage's
// tabs, TrackerPage's per-sport breakdown) instead of three copies drifting.
// Icons live in src/components/icons/SportIcons.jsx, not here.
export const SPORT_LABEL = {
  football: 'Football',
  racing: 'Horse Racing',
  ufc: 'UFC',
  multi: 'Multi-sport',
  ...Object.fromEntries(Object.entries(GENERIC_SPORTS).map(([key, cfg]) => [key, cfg.label]))
}

// A sentinel, not a real Odds API sport key - tennis has no fixed key the
// way the soccer leagues above do (see GENERIC_SPORTS.tennis's own
// comment), so this flows through the same neededKeys Set every caller
// below already builds, and netlify/functions/scores.js expands it into
// whichever tennis_* keys The Odds API currently lists as active (the same
// discovery netlify/functions/sport.js does for tennis odds) before it
// queries /scores for real.
export const TENNIS_DYNAMIC_KEY = 'tennis_dynamic'

// Shared by src/lib/settlement.js, netlify/functions/auto-settle.js and
// src/lib/liveScores.js - anything that needs to ask The Odds API's
// /scores endpoint about a sport has to go through the same internal-key
// -> real-API-key mapping.
export function apiKeysForSport(internalSport) {
  if (internalSport === 'football') return FOOTBALL_SPORT_KEYS
  if (internalSport === 'ufc') return [UFC_SPORT_KEY]
  if (GENERIC_SPORTS[internalSport]?.dynamicPrefix) return [TENNIS_DYNAMIC_KEY]
  return GENERIC_SPORTS[internalSport]?.apiSportKeys ?? []
}

// The four `provider: 'sgo'` sports (basketball/hockey/baseball/nfl) have
// no Odds-API key at all - SportsGameOdds is a completely different
// provider, keyed by its own eventID rather than a sport-wide key, so
// settlement/live-scores/results-archive need the specific event a leg was
// struck on (leg.eventId, already stored for CLV lookups) rather than a
// sport-wide fetch window. Returns null for every other sport, so callers
// can filter with .filter(Boolean) the same way they already collect keys.
export function sgoEventIdForLeg(leg) {
  return GENERIC_SPORTS[leg.sport]?.provider === 'sgo' ? (leg.eventId ?? null) : null
}

// For "browse recent results" (src/api/resultsClient.js's Results tab,
// which isn't scoped to any one user's bets) rather than settlement's
// specific-event lookup above - there's no set of eventIds to ask about
// yet, so this needs SportsGameOdds' own leagueID instead.
export function sgoLeagueForSport(sport) {
  const config = GENERIC_SPORTS[sport]
  return config?.provider === 'sgo' ? config.leagueID : null
}
