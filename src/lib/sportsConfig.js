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
  tennis: { label: 'Tennis', icon: '🎾', dynamicPrefix: 'tennis_', participantType: 'player', hasDraw: false },
  // These four run through SportsGameOdds (netlify/functions/sport.js
  // branches on `provider`) instead of The Odds API - separate free
  // quota, and better-suited coverage for US sports than querying UK
  // bookmakers for them ever was. provider/leagueID replace apiSportKeys;
  // apiKeysForSport() below (the Odds-API /scores lookup used for
  // settlement/results) has no equivalent for these yet, so auto-settle
  // and the results archive don't cover them - manual settling still
  // works fine, this only affects the automatic part.
  basketball: { label: 'Basketball', icon: '🏀', provider: 'sgo', leagueID: 'NBA', participantType: 'team', hasDraw: false },
  hockey: { label: 'Ice Hockey', icon: '🏒', provider: 'sgo', leagueID: 'NHL', participantType: 'team', hasDraw: false },
  baseball: { label: 'Baseball', icon: '⚾', provider: 'sgo', leagueID: 'MLB', participantType: 'team', hasDraw: false },
  nfl: { label: 'NFL', icon: '🏈', provider: 'sgo', leagueID: 'NFL', participantType: 'team', hasDraw: false },
  rugbyLeague: { label: 'Rugby League', icon: '🏉', apiSportKeys: ['rugbyleague_nrl'], participantType: 'team', hasDraw: true },
  rugbyUnion: { label: 'Rugby Union', icon: '🏉', apiSportKeys: ['rugbyunion_six_nations'], participantType: 'team', hasDraw: true },
  cricket: {
    label: 'Cricket',
    icon: '🏏',
    apiSportKeys: ['cricket_international_t20', 'cricket_ipl', 'cricket_big_bash', 'cricket_the_hundred', 'cricket_t20_blast'],
    participantType: 'team',
    hasDraw: true
  },
  boxing: { label: 'Boxing', icon: '🥊', apiSportKeys: ['boxing_boxing'], participantType: 'player', hasDraw: false }
}

// The three hand-built sports (see file comment above) plus every generic
// one, keyed the same way bet_posts/manual_entries.sport is stored - one
// place for anything that needs a sport's display label/icon (OddsListPage's
// tabs, TrackerPage's per-sport breakdown) instead of three copies drifting.
export const SPORT_LABEL = {
  football: 'Football',
  racing: 'Horse Racing',
  ufc: 'UFC',
  multi: 'Multi-sport',
  ...Object.fromEntries(Object.entries(GENERIC_SPORTS).map(([key, cfg]) => [key, cfg.label]))
}
export const SPORT_ICON = {
  football: '⚽',
  racing: '🏇',
  ufc: '🥊',
  multi: '🎟️',
  ...Object.fromEntries(Object.entries(GENERIC_SPORTS).map(([key, cfg]) => [key, cfg.icon]))
}

// Shared by src/lib/settlement.js and src/api/resultsClient.js - anything
// that needs to ask The Odds API's /scores endpoint about a sport has to
// go through the same internal-key -> real-API-key mapping. Tennis isn't
// included: it needs the same dynamic tournament-discovery sport.js does
// for odds, which /scores doesn't have a parallel for yet.
export function apiKeysForSport(internalSport) {
  if (internalSport === 'football') return FOOTBALL_SPORT_KEYS
  if (internalSport === 'ufc') return [UFC_SPORT_KEY]
  return GENERIC_SPORTS[internalSport]?.apiSportKeys ?? []
}
