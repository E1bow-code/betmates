import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summariseTeamForm, teamNameMatches } from './teamForm.js'

test('teamNameMatches handles exact, substring and shared-word cases', () => {
  assert.equal(teamNameMatches('Arsenal', 'arsenal'), true)
  assert.equal(teamNameMatches('Manchester United', 'manchester united'), true)
  assert.equal(teamNameMatches('Tottenham Hotspur', 'tottenham'), true) // shared distinctive word
  assert.equal(teamNameMatches('Arsenal', 'Chelsea'), false)
  assert.equal(teamNameMatches('', 'Arsenal'), false)
  assert.equal(teamNameMatches('Arsenal', ''), false)
})

const game = (home, hs, away, as) => ({
  homeTeam: home,
  awayTeam: away,
  scores: [
    { name: home, score: String(hs) },
    { name: away, score: String(as) }
  ]
})

const games = [
  game('Arsenal', 2, 'Chelsea', 1), // Arsenal win, home
  game('Liverpool', 3, 'Arsenal', 3), // Arsenal draw, away
  game('Arsenal', 0, 'Everton', 1), // Arsenal loss, home
  game('Tottenham Hotspur', 1, 'Wolves', 1) // not Arsenal
]

test('summariseTeamForm reports unavailable for an empty or unmatched team', () => {
  assert.equal(summariseTeamForm(games, '').available, false)
  assert.equal(summariseTeamForm(games, 'Sunderland').available, false)
  assert.equal(summariseTeamForm([], 'Arsenal').available, false)
})

test('summariseTeamForm tallies W/D/L, goals and per-result detail for one team', () => {
  const out = summariseTeamForm(games, 'Arsenal')
  assert.equal(out.available, true)
  assert.equal(out.team, 'Arsenal')
  assert.equal(out.played, 3)
  assert.equal(out.won, 1)
  assert.equal(out.drawn, 1)
  assert.equal(out.lost, 1)
  assert.equal(out.goalsFor, 2 + 3 + 0)
  assert.equal(out.goalsAgainst, 1 + 3 + 1)
  assert.equal(out.results.length, 3)
  // The away draw at Liverpool is captured with the right venue + opponent.
  const atLiverpool = out.results.find((r) => r.opponent === 'Liverpool')
  assert.deepEqual(atLiverpool, { opponent: 'Liverpool', venue: 'away', score: '3-3', outcome: 'D' })
  assert.match(out.note, /web_search/)
})

test('summariseTeamForm skips games with a non-numeric score rather than counting a phantom result', () => {
  const dodgy = [{ homeTeam: 'Arsenal', awayTeam: 'Chelsea', scores: [{ name: 'Arsenal', score: null }, { name: 'Chelsea', score: '1' }] }]
  assert.equal(summariseTeamForm(dodgy, 'Arsenal').available, false)
})
