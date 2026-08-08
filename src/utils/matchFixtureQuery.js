// Ranks fixtures against a free-text query by team-name match, for
// CoachGPT's find_fixture tool (netlify/functions/coachgpt.js) - pure so
// it's unit-testable without touching the network. Splits the query into
// words (dropping short/connector words like "v"/"vs"/"the"/"game"/
// "tonight" that add noise rather than signal), then scores each fixture
// by how many of those words appear inside its team names. Returns
// `{ fixture, score }` pairs, highest score first, so a caller can tell
// "one clear leader" from "several tied" (ambiguous - worth asking which
// one) rather than silently picking an arbitrary winner.
const STOPWORDS = new Set(['v', 'vs', 'the', 'game', 'match', 'tonight', 'today', 'tomorrow', 'this', 'weekend', 'fixture', 'fight'])

function queryWords(query) {
  return (query ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
}

export function matchFixtureQuery(fixtures, query, limit = 5) {
  const words = queryWords(query)
  if (!words.length) return []

  return (fixtures ?? [])
    .map((fixture) => {
      const haystack = `${fixture.homeTeam ?? fixture.participantA ?? ''} ${fixture.awayTeam ?? fixture.participantB ?? ''}`.toLowerCase()
      const score = words.filter((w) => haystack.includes(w)).length
      return { fixture, score }
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}
