// Ranks fixtures against a free-text query by team/fighter-name match, for
// CoachGPT's find_fixture tool (netlify/functions/coachgpt.js) - pure so
// it's unit-testable without touching the network. Splits the query into
// words (dropping short/connector words like "v"/"vs"/"the"/"game"/
// "tonight" that add noise rather than signal), then scores each fixture
// by how many of those words appear inside its participant names. Returns
// `{ fixture, score }` pairs, highest score first, so a caller can tell
// "one clear leader" from "several tied" (ambiguous - worth asking which
// one) rather than silently picking an arbitrary winner.
// "card" is UFC/boxing lingo for a fight bill ("the fight card") - without
// excluding it, a query like "best value on the UFC card" spuriously
// substring-matches "Cardiff" and returns a totally unrelated football
// fixture instead of no result at all, which is worse (a confidently wrong
// answer beats nothing far less often than an honest "can't find it").
const STOPWORDS = new Set(['v', 'vs', 'the', 'game', 'match', 'tonight', 'today', 'tomorrow', 'this', 'weekend', 'fixture', 'fight', 'card'])

// Fan nicknames The Odds API's official team names never contain - without
// this, an entirely normal question like "what's the value on Spurs" would
// never match "Tottenham Hotspur" at all. Adds the canonical fragment as an
// EXTRA search term alongside the original word (not a replacement), so a
// literal match on the nickname itself (rare, but harmless) still counts
// too. Deliberately not exhaustive - covers the clubs actually in this
// app's leagues (EPL, Championship, MLS) plus the handful of nicknames
// common enough to show up unprompted.
const NICKNAMES = {
  spurs: 'tottenham',
  gunners: 'arsenal',
  gooners: 'arsenal',
  reds: 'liverpool',
  citizens: 'manchester',
  hammers: 'ham',
  toffees: 'everton',
  villans: 'villa',
  blues: 'chelsea',
  saints: 'southampton',
  cherries: 'bournemouth',
  eagles: 'palace',
  foxes: 'leicester',
  wolves: 'wolverhampton',
  magpies: 'newcastle',
  seagulls: 'brighton',
  canaries: 'norwich',
  baggies: 'albion',
  posh: 'peterborough',
  rams: 'derby',
  potters: 'stoke',
  tigers: 'hull',
  robins: 'bristol',
  trotters: 'bolton',
  latics: 'wigan',
  addicks: 'charlton',
  cottagers: 'fulham',
  hornets: 'watford'
}

function queryWords(query) {
  const words = (query ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
  const expansions = words.map((w) => NICKNAMES[w]).filter(Boolean)
  return [...new Set([...words, ...expansions])]
}

// Every participant-name shape used across this app's sports: football/
// tennis/generic-sports use homeTeam/awayTeam or participantA/participantB
// (src/api/oddsClient.js, genericSportsClient.js), UFC uses fighterA/
// fighterB (src/api/ufcClient.js) - a given fixture only ever populates
// its own sport's fields, so checking all of them is safe and keeps this
// function sport-agnostic rather than needing a branch per sport.
function participantNames(fixture) {
  return [fixture.homeTeam, fixture.awayTeam, fixture.participantA, fixture.participantB, fixture.fighterA, fixture.fighterB]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export function matchFixtureQuery(fixtures, query, limit = 5) {
  const words = queryWords(query)
  if (!words.length) return []

  return (fixtures ?? [])
    .map((fixture) => {
      const haystack = participantNames(fixture)
      const score = words.filter((w) => haystack.includes(w)).length
      return { fixture, score }
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

// Horse racing's shape is fundamentally different (a race has many
// runners, not two participants - see netlify/functions/racing.js's
// reshapeRace/reshapeRunner) so it gets its own matcher rather than being
// forced into participantNames above: scores each RUNNER (not the race as
// a whole) against the course/race name/horse name, so "how's Frankel
// doing in the 3:15" and "what's on at Ascot today" both work.
// For CoachGPT's list_upcoming_events tool (netlify/functions/coachgpt.js) -
// "what's on tonight/today" needs to browse fixtures by TIME, not by name
// the way matchFixtureQuery/matchRaceQuery above do (a bare time-word query
// like "what's on tonight" has nothing left to match on once STOPWORDS
// strips "tonight" - confirmed live, CoachGPT had no way to actually answer
// it). Pure predicate, `now` injectable so it's testable without mocking
// Date.
export function startsWithinHours(isoTimestamp, hours, now = Date.now()) {
  if (!isoTimestamp) return false
  const t = new Date(isoTimestamp).getTime()
  if (Number.isNaN(t)) return false
  return t >= now && t <= now + hours * 60 * 60 * 1000
}

export function matchRaceQuery(races, query, limit = 5) {
  const words = queryWords(query)
  if (!words.length) return []

  return (races ?? [])
    .flatMap((race) =>
      (race.runners ?? []).map((runner) => {
        const haystack = `${race.course ?? ''} ${race.raceName ?? ''} ${runner.name ?? ''}`.toLowerCase()
        const score = words.filter((w) => haystack.includes(w)).length
        return { race, runner, score }
      })
    )
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}
