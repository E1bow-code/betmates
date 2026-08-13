// Proxy to TheSportsDB (https://www.thesportsdb.com/free_sports_api) for
// club crests, keeping the lookup server-side instead of firing it from the
// browser like src/lib/teamBadges.js used to. Two reasons this belongs on
// the server, both of which showed up as missing badges (initials-only) on
// real devices, worst on mobile:
//   1. TheSportsDB's JSON API doesn't reliably send CORS headers, so a
//      browser fetch can be blocked outright and fall straight to initials.
//   2. The free tier is rate-limited, and the Odds list mounts ~20 fixtures
//      = ~40 team lookups at once. From a flaky mobile connection that burst
//      loses far more requests than a desktop on wifi - which is exactly the
//      "works on my laptop, blank on my phone" report. Proxying means the
//      whole userbase shares one cached lookup per club (see apiCache.js),
//      so each crest is fetched from TheSportsDB at most once per TTL total.
// Never throws - the client gets { url: null } on any failure and renders an
// initials badge (src/components/TeamBadge.jsx).
import { cacheGet, cacheSet } from '../../src/lib/apiCache.js'

// Crests effectively never change, so cache hits for a week. A genuine miss
// (team not found) is cached for the same hour, but a fetch that outright
// failed (rate limit, timeout, a flaky mobile-triggered blip on the way to
// TheSportsDB) says nothing about whether the club exists - caching THAT for
// an hour was blanking real crests until the TTL happened to expire on
// whichever warm instance took the request. Retry that case in minutes.
const HIT_TTL = 7 * 24 * 60 * 60 * 1000
const MISS_TTL = 60 * 60 * 1000
const FAILURE_TTL = 5 * 60 * 1000

// Common English nicknames repeat across totally unrelated sports/leagues -
// searching "Kings" (e.g. Sacramento Kings, NBA) turns up "Kingstonian", an
// English non-league SOCCER club, as the top result; "Panthers" (Carolina/
// Florida) turns up an Italian women's BASKETBALL team; "Giants" (NY/SF)
// turns up an Australian NETBALL team. Same class of bug as
// netlify/functions/player-photo.js, fixed the same way: when the caller
// knows its sport, only trust a result that's actually that sport. Rugby
// league and union share TheSportsDB's single "Rugby" strSport value - not
// worth disambiguating further, since the goal here is just ruling out
// wrong-sport matches, not wrong-code-of-rugby ones.
const SPORT_MAP = {
  football: 'Soccer',
  basketball: 'Basketball',
  hockey: 'Ice Hockey',
  baseball: 'Baseball',
  nfl: 'American Football',
  rugbyLeague: 'Rugby',
  rugbyUnion: 'Rugby',
  cricket: 'Cricket'
}

// The odds feed and TheSportsDB don't always spell a club the same way, so
// a raw lookup misses and the crest falls back to initials. Map the short
// forms we actually see onto the name TheSportsDB indexes. Keyed lowercase;
// only list a club when the two genuinely differ - a wrong alias is worse
// than none. Extend as more mismatches turn up.
const TEAM_ALIASES = {
  // English - short forms and nicknames that don't match TheSportsDB raw.
  'man city': 'Manchester City',
  'man utd': 'Manchester United',
  'man united': 'Manchester United',
  spurs: 'Tottenham Hotspur',
  wolves: 'Wolverhampton Wanderers',
  villa: 'Aston Villa',
  palace: 'Crystal Palace',
  forest: 'Nottingham Forest',
  'nottm forest': 'Nottingham Forest',
  "nott'm forest": 'Nottingham Forest',
  leeds: 'Leeds United',
  'west brom': 'West Bromwich Albion',
  wba: 'West Bromwich Albion',
  qpr: 'Queens Park Rangers',
  'sheffield utd': 'Sheffield United',
  'sheff utd': 'Sheffield United',
  'sheffield wed': 'Sheffield Wednesday',
  'sheff wed': 'Sheffield Wednesday',
  // The Odds API sends the full "Brighton and Hove Albion"; TheSportsDB
  // indexes it as "Brighton".
  'brighton and hove albion': 'Brighton',
  'brighton & hove albion': 'Brighton',
  // European - nicknames/abbreviations that would never resolve on their own.
  psg: 'Paris Saint-Germain',
  'paris saint germain': 'Paris Saint-Germain',
  inter: 'Inter Milan',
  roma: 'AS Roma',
  juve: 'Juventus',
  'bayern munich': 'Bayern Munich',
  'atletico madrid': 'Atlético Madrid',
  atleti: 'Atlético Madrid',
  barca: 'Barcelona',
  dortmund: 'Borussia Dortmund',
  bvb: 'Borussia Dortmund',
  gladbach: 'Borussia Mönchengladbach',
  leverkusen: 'Bayer Leverkusen',
  psv: 'PSV Eindhoven',
  porto: 'FC Porto'
}

function resolveTeam(name) {
  return TEAM_ALIASES[name.trim().toLowerCase()] ?? name
}

function json(url, source) {
  const headers = { 'content-type': 'application/json' }
  if (source) headers['x-data-source'] = source
  return new Response(JSON.stringify({ url }), { status: 200, headers })
}

export default async (req) => {
  const params = new URL(req.url).searchParams
  const team = params.get('team')
  if (!team) return json(null)
  const sport = params.get('sport')
  const wantedSport = SPORT_MAP[sport]

  // Cache and look up by the resolved name, so every spelling of a club
  // ("Man City", "Manchester City") shares one crest and one upstream call.
  const resolved = resolveTeam(team)
  const key = wantedSport ? `badge-${sport}-${resolved.toLowerCase()}` : `badge-${resolved.toLowerCase()}`
  const cached = cacheGet(key)
  if (cached !== undefined) return json(cached, 'live-cached')

  // Test key "3" needs no registration; set SPORTSDB_API_KEY to a paid key
  // if the free tier's rate limits start blanking badges under real traffic.
  const apiKey = process.env.SPORTSDB_API_KEY || '3'
  try {
    const res = await fetch(`https://www.thesportsdb.com/api/v1/json/${apiKey}/searchteams.php?t=${encodeURIComponent(resolved)}`)
    if (!res.ok) throw new Error(`TheSportsDB: ${res.status}`)
    const data = await res.json()
    // With a known sport, only trust a result that's actually that sport -
    // no badge at all beats a confidently-wrong one from a different sport.
    const match = wantedSport ? data?.teams?.find((t) => t.strSport === wantedSport) : data?.teams?.[0]
    const badge = match?.strBadge ?? null
    cacheSet(key, badge, badge ? HIT_TTL : MISS_TTL)
    return json(badge, 'live')
  } catch (err) {
    console.error(`team-badge lookup failed for "${team}":`, err.message)
    cacheSet(key, null, FAILURE_TTL)
    return json(null)
  }
}
