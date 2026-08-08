import test from 'node:test'
import assert from 'node:assert/strict'
import { matchFixtureQuery } from './matchFixtureQuery.js'

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
