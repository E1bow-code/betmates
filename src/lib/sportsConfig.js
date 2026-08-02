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
export const FOOTBALL_SPORT_KEYS = ['soccer_epl', 'soccer_efl_champ', 'soccer_scotland_premiership', 'soccer_uefa_champs_league']
export const UFC_SPORT_KEY = 'mma_mixed_martial_arts'

export const GENERIC_SPORTS = {
  basketball: { label: 'Basketball', icon: '🏀', apiSportKeys: ['basketball_nba'], participantType: 'team', hasDraw: false },
  hockey: { label: 'Ice Hockey', icon: '🏒', apiSportKeys: ['icehockey_nhl'], participantType: 'team', hasDraw: false },
  baseball: { label: 'Baseball', icon: '⚾', apiSportKeys: ['baseball_mlb'], participantType: 'team', hasDraw: false },
  nfl: { label: 'NFL', icon: '🏈', apiSportKeys: ['americanfootball_nfl'], participantType: 'team', hasDraw: false },
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
