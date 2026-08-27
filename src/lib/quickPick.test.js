import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PICKER_SPORTS,
  groupByCompetition,
  participantsFor,
  participantTypeFor,
  labelFor,
  normalizeItem,
} from './quickPick.js'

// loadItemsForSport is a thin network fetcher, so it's out of scope here - the
// rest of the module is pure and drives the picker's shape.

test('PICKER_SPORTS leads with the core sports then the generic ones', () => {
  assert.equal(PICKER_SPORTS[0], 'football')
  assert.ok(PICKER_SPORTS.includes('racing'))
  assert.ok(PICKER_SPORTS.includes('ufc'))
  assert.ok(PICKER_SPORTS.includes('tennis')) // a generic sport, appended after the core three
})

test('groupByCompetition buckets items by competition, "Other" for a missing one', () => {
  const items = [
    { id: 1, competition: 'Premier League' },
    { id: 2, competition: 'Championship' },
    { id: 3, competition: 'Premier League' },
    { id: 4 } // no competition field
  ]
  const groups = groupByCompetition(items)
  assert.equal(groups.length, 3)
  assert.equal(groups.find((g) => g.competition === 'Premier League').items.length, 2)
  assert.ok(groups.find((g) => g.competition === 'Other'))
})

test('participantsFor returns the right pair per sport shape', () => {
  assert.deepEqual(participantsFor('football', { homeTeam: 'Arsenal', awayTeam: 'Chelsea' }), ['Arsenal', 'Chelsea'])
  assert.deepEqual(participantsFor('ufc', { fighterA: 'Jones', fighterB: 'Aspinall' }), ['Jones', 'Aspinall'])
  assert.deepEqual(participantsFor('tennis', { participantA: 'Alcaraz', participantB: 'Sinner' }), ['Alcaraz', 'Sinner'])
})

test('participantTypeFor maps a sport to its head-to-head photo type', () => {
  assert.equal(participantTypeFor('football'), 'team')
  assert.equal(participantTypeFor('ufc'), 'player')
  assert.equal(participantTypeFor('racing'), null) // many-runner field, no h2h pair
  assert.equal(participantTypeFor('tennis'), 'player') // from GENERIC_SPORTS config
})

test('labelFor builds "A v B" for the two-participant sports', () => {
  assert.equal(labelFor('football', { homeTeam: 'Arsenal', awayTeam: 'Chelsea' }), 'Arsenal v Chelsea')
  assert.equal(labelFor('ufc', { fighterA: 'Jones', fighterB: 'Aspinall' }), 'Jones v Aspinall')
})

test('normalizeItem builds a leg in the shared shape for a team sport (Home resolved to the team)', () => {
  const item = {
    id: 'evt1',
    kickoff: '2026-08-27T14:00:00Z',
    homeTeam: 'Arsenal',
    awayTeam: 'Chelsea',
    markets: [
      {
        key: 'h2h',
        label: 'Match Result',
        outcomes: [
          { name: 'Home', bestOdds: { decimal: 2.1, bookmaker: 'Bet365', link: 'https://x', isBetslipLink: true } }
        ]
      }
    ]
  }
  const out = normalizeItem('football', item)
  assert.equal(out.label, 'Arsenal v Chelsea')
  const leg = out.markets[0].outcomes[0].leg
  assert.equal(leg.selection, 'Arsenal') // 'Home' resolved to the home team
  assert.equal(leg.outcomeName, 'Home') // raw outcome name preserved for matching
  assert.equal(leg.odds, 2.1)
  assert.equal(leg.bookmaker, 'Bet365')
  assert.equal(leg.marketKey, 'h2h')
  assert.equal(leg.sport, 'football')
  assert.equal(leg.eventId, 'evt1')
})

test('normalizeItem builds a Win market from racing runners', () => {
  const item = {
    id: 'race1',
    offTime: '2026-08-27T15:15:00Z',
    course: 'Ascot',
    raceName: 'The Big One',
    runners: [{ id: 'h1', name: 'Fast Horse', bestOdds: { decimal: 3.5, bookmaker: 'Sky Bet' } }]
  }
  const out = normalizeItem('racing', item)
  assert.equal(out.markets[0].key, 'win')
  const leg = out.markets[0].outcomes[0].leg
  assert.equal(leg.selection, 'Fast Horse')
  assert.equal(leg.odds, 3.5)
  assert.equal(leg.raceId, 'race1')
  assert.equal(leg.horseId, 'h1')
  assert.equal(leg.runnerCount, 1)
  assert.equal(leg.sport, 'racing')
})
