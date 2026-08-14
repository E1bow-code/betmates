import test from 'node:test'
import assert from 'node:assert/strict'
import { matchFixtureQuery, matchRaceQuery, startsWithinHours } from './matchFixtureQuery.js'

const fixture = (over) => ({ id: 'x', homeTeam: 'Home', awayTeam: 'Away', ...over })

test('matchFixtureQuery finds a clear single leader from a "v" query', () => {
  const fixtures = [
    fixture({ id: '1', homeTeam: 'Arsenal', awayTeam: 'Chelsea' }),
    fixture({ id: '2', homeTeam: 'Everton', awayTeam: 'Fulham' })
  ]
  const result = matchFixtureQuery(fixtures, 'Arsenal v Chelsea')
  assert.equal(result.length, 1)
  assert.equal(result[0].fixture.id, '1')
  assert.equal(result[0].score, 2)
})

test('matchFixtureQuery ranks a two-word match above a one-word match', () => {
  const fixtures = [
    fixture({ id: 'one-word', homeTeam: 'Arsenal', awayTeam: 'Fulham' }),
    fixture({ id: 'two-word', homeTeam: 'Arsenal', awayTeam: 'Chelsea' })
  ]
  const result = matchFixtureQuery(fixtures, 'Arsenal v Chelsea')
  assert.equal(result[0].fixture.id, 'two-word')
  assert.equal(result[0].score, 2)
  assert.equal(result[1].fixture.id, 'one-word')
  assert.equal(result[1].score, 1)
})

test('matchFixtureQuery returns tied fixtures together rather than picking one', () => {
  const fixtures = [
    fixture({ id: 'a', homeTeam: 'Arsenal', awayTeam: 'Fulham' }),
    fixture({ id: 'b', homeTeam: 'Arsenal', awayTeam: 'Everton' })
  ]
  const result = matchFixtureQuery(fixtures, 'Arsenal')
  assert.equal(result.length, 2)
  assert.equal(result[0].score, result[1].score)
})

test('matchFixtureQuery ignores connector words like "v"/"the"/"tonight"', () => {
  const fixtures = [fixture({ id: '1', homeTeam: 'Arsenal', awayTeam: 'Chelsea' })]
  const result = matchFixtureQuery(fixtures, 'the Arsenal v Chelsea game tonight')
  assert.equal(result[0].score, 2) // not inflated by "the"/"game"/"tonight" matching nothing
})

test('matchFixtureQuery falls back to participantA/participantB for generic sports', () => {
  const fixtures = [{ id: '1', participantA: 'Djokovic', participantB: 'Alcaraz' }]
  const result = matchFixtureQuery(fixtures, 'Djokovic')
  assert.equal(result.length, 1)
  assert.equal(result[0].fixture.id, '1')
})

test('matchFixtureQuery returns nothing for an empty/blank query', () => {
  const fixtures = [fixture({})]
  assert.deepEqual(matchFixtureQuery(fixtures, ''), [])
  assert.deepEqual(matchFixtureQuery(fixtures, '   '), [])
  assert.deepEqual(matchFixtureQuery(fixtures, null), [])
})

test('matchFixtureQuery returns nothing when no fixture matches at all', () => {
  const fixtures = [fixture({ homeTeam: 'Arsenal', awayTeam: 'Chelsea' })]
  assert.deepEqual(matchFixtureQuery(fixtures, 'Manchester United'), [])
})

test('matchFixtureQuery honours the limit', () => {
  const fixtures = Array.from({ length: 10 }, (_, i) => fixture({ id: String(i), homeTeam: 'Arsenal', awayTeam: `Team${i}` }))
  const result = matchFixtureQuery(fixtures, 'Arsenal', 3)
  assert.equal(result.length, 3)
})

test('matchFixtureQuery resolves a fan nickname to the official team name', () => {
  const fixtures = [
    fixture({ id: 'spurs', homeTeam: 'Tottenham Hotspur', awayTeam: 'Fulham' }),
    fixture({ id: 'other', homeTeam: 'Everton', awayTeam: 'Norwich' })
  ]
  const result = matchFixtureQuery(fixtures, 'Spurs')
  assert.equal(result.length, 1)
  assert.equal(result[0].fixture.id, 'spurs')
})

test('matchFixtureQuery does not let "card" spuriously match "Cardiff"', () => {
  const fixtures = [fixture({ id: '1', homeTeam: 'Cardiff City', awayTeam: 'Wrexham' })]
  const result = matchFixtureQuery(fixtures, 'best value fight card this weekend')
  assert.deepEqual(result, [])
})

test('matchFixtureQuery matches UFC fighterA/fighterB fields', () => {
  const fixtures = [{ id: '1', fighterA: 'Jon Jones', fighterB: 'Stipe Miocic' }]
  const result = matchFixtureQuery(fixtures, 'Jon Jones')
  assert.equal(result.length, 1)
  assert.equal(result[0].fixture.id, '1')
})

test('matchRaceQuery matches a specific runner by name', () => {
  const races = [
    { id: 'r1', course: 'Ascot', raceName: '3:15 Handicap', runners: [{ name: 'Frankel' }, { name: 'Sea Biscuit' }] },
    { id: 'r2', course: 'Newmarket', raceName: '2:00 Maiden', runners: [{ name: 'Red Rum' }] }
  ]
  const result = matchRaceQuery(races, 'Frankel')
  assert.equal(result.length, 1)
  assert.equal(result[0].race.id, 'r1')
  assert.equal(result[0].runner.name, 'Frankel')
})

test('matchRaceQuery matches by course name and returns every runner in that race', () => {
  const races = [{ id: 'r1', course: 'Ascot', raceName: '3:15 Handicap', runners: [{ name: 'Frankel' }, { name: 'Sea Biscuit' }] }]
  const result = matchRaceQuery(races, 'Ascot')
  assert.equal(result.length, 2)
})

test('matchRaceQuery returns nothing for an empty query or no runners', () => {
  assert.deepEqual(matchRaceQuery([{ id: 'r1', course: 'Ascot', runners: [] }], 'Ascot'), [])
  assert.deepEqual(matchRaceQuery([{ id: 'r1', course: 'Ascot', runners: [{ name: 'Frankel' }] }], ''), [])
})

test('startsWithinHours is true for a timestamp inside the window', () => {
  const now = Date.parse('2026-08-14T12:00:00Z')
  assert.equal(startsWithinHours('2026-08-14T20:00:00Z', 20, now), true)
})

test('startsWithinHours is false for a timestamp already in the past', () => {
  const now = Date.parse('2026-08-14T12:00:00Z')
  assert.equal(startsWithinHours('2026-08-14T10:00:00Z', 20, now), false)
})

test('startsWithinHours is false for a timestamp beyond the window', () => {
  const now = Date.parse('2026-08-14T12:00:00Z')
  assert.equal(startsWithinHours('2026-08-16T12:00:00Z', 20, now), false)
})

test('startsWithinHours is false for a missing or invalid timestamp', () => {
  assert.equal(startsWithinHours(null, 20), false)
  assert.equal(startsWithinHours('not-a-date', 20), false)
})
