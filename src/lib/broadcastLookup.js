// Real "watch it now" links, upgrading WatchLiveButton's generic Bet365
// fallback with an actual broadcaster when one can be found. Source is
// ESPN's public (undocumented, but CORS-open and free - confirmed by
// direct testing) scoreboard API, which lists broadcasters per fixture for
// most major leagues. It has no shared event-ID space with The Odds
// API/SportsGameOdds, so matching is done by normalising and comparing
// participant names against ESPN's competitors for that day - imperfect,
// but WatchLiveButton only ever calls this once an event is already live
// (see isLive), which keeps the date window tight and false positives rare.
// Any miss - unmapped league, no name match, unmapped broadcaster - falls
// back to the existing Bet365 link, never a broken or misleading one.

const LEAGUE_MAP = {
  soccer_epl: { sport: 'soccer', league: 'eng.1' },
  soccer_efl_champ: { sport: 'soccer', league: 'eng.2' },
  soccer_scotland_premiership: { sport: 'soccer', league: 'sco.1' },
  soccer_uefa_champs_league: { sport: 'soccer', league: 'uefa.champions' },
  soccer_usa_mls: { sport: 'soccer', league: 'usa.1' },
  ufc: { sport: 'mma', league: 'ufc' },
  basketball: { sport: 'basketball', league: 'nba' },
  hockey: { sport: 'hockey', league: 'nhl' },
  baseball: { sport: 'baseball', league: 'mlb' },
  nfl: { sport: 'football', league: 'nfl' }
}

// Only broadcasters common enough to be worth a hardcoded homepage - ESPN
// also returns regional/local networks (MASN, Angels.TV, ...) that have no
// one sensible link, those are left unmapped and just fall through.
const BROADCASTER_LINKS = {
  ESPN: 'https://www.espn.com/watch/',
  ESPN2: 'https://www.espn.com/watch/',
  'ESPN+': 'https://www.espn.com/watch/',
  ESPNU: 'https://www.espn.com/watch/',
  ABC: 'https://abc.com/watch-live',
  FOX: 'https://www.fox.com/live/',
  FS1: 'https://www.fox.com/live/',
  FS2: 'https://www.fox.com/live/',
  NBC: 'https://www.nbc.com/live',
  CBS: 'https://www.cbs.com/live-tv/',
  TNT: 'https://www.tntdrama.com/watchtnt',
  TBS: 'https://www.tbs.com/watchtbs',
  truTV: 'https://www.trutv.com/watch',
  Peacock: 'https://www.peacocktv.com/',
  'Paramount+': 'https://www.paramountplus.com/',
  'Amazon Prime Video': 'https://www.amazon.com/gp/video/storefront',
  'Prime Video': 'https://www.amazon.com/gp/video/storefront',
  YouTube: 'https://www.youtube.com/',
  'YouTube TV': 'https://tv.youtube.com/',
  'MLB.TV': 'https://www.mlb.com/live-stream-games',
  'NBA League Pass': 'https://www.nba.com/watch',
  'NHL.TV': 'https://www.nhl.com/tv',
  'Sky Sports': 'https://www.skysports.com/watch',
  'TNT Sports': 'https://tntsports.co.uk/',
  DAZN: 'https://www.dazn.com/',
  'beIN SPORTS': 'https://www.beinsports.com/'
}

const scoreboardCache = new Map()

function normaliseName(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
}

// Two names "match" if one contains the other's last word (surname for a
// person, or the whole short name for a team) - loose on purpose, since
// ESPN and The Odds API/SportsGameOdds don't always spell a name the same
// way (accents, "St." vs "Saint", club suffixes).
function namesMatch(a, b) {
  const na = normaliseName(a)
  const nb = normaliseName(b)
  if (!na || !nb) return false
  if (na === nb || na.includes(nb) || nb.includes(na)) return true
  const lastA = na.split(' ').pop()
  const lastB = nb.split(' ').pop()
  return lastA.length > 2 && (na.includes(lastB) || nb.includes(lastA))
}

async function fetchScoreboard(sport, league, dateStr) {
  const cacheKey = `${sport}/${league}/${dateStr}`
  if (scoreboardCache.has(cacheKey)) return scoreboardCache.get(cacheKey)

  const promise = fetch(`https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/scoreboard?dates=${dateStr}`)
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => data?.events ?? [])
    .catch(() => [])

  scoreboardCache.set(cacheKey, promise)
  // Live scoreboards move - don't let one lookup's cache entry poison
  // matches for the rest of the (short) live window.
  setTimeout(() => scoreboardCache.delete(cacheKey), 3 * 60 * 1000)
  return promise
}

// leagueKey: a football sport_key ('soccer_epl'), 'ufc', or a GENERIC_SPORTS
// key ('basketball', 'hockey', 'baseball', 'nfl') - anything else (tennis,
// rugby, cricket, boxing, racing) has no mapping and resolves to null.
export async function getBroadcastInfo(leagueKey, participants, kickoff) {
  const mapped = LEAGUE_MAP[leagueKey]
  if (!mapped || !participants?.[0] || !participants?.[1]) return null

  const dateStr = new Date(kickoff ?? Date.now()).toISOString().slice(0, 10).replace(/-/g, '')
  const events = await fetchScoreboard(mapped.sport, mapped.league, dateStr)

  const match = events.find((ev) => {
    const competitors = (ev.competitions?.[0]?.competitors ?? []).map((c) => c.athlete?.displayName ?? c.team?.displayName ?? '')
    if (competitors.length < 2) return false
    return (
      (namesMatch(competitors[0], participants[0]) && namesMatch(competitors[1], participants[1])) ||
      (namesMatch(competitors[0], participants[1]) && namesMatch(competitors[1], participants[0]))
    )
  })
  if (!match) return null

  const broadcaster = match.competitions?.[0]?.broadcasts?.[0]?.names?.[0]
  if (!broadcaster) return null
  const url = BROADCASTER_LINKS[broadcaster]
  if (!url) return null

  return { broadcaster, url }
}
