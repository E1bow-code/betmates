// Run with `npm test` (node:test, no test framework installed - these are
// the only rules in the app that decide what a bet pays, and they run in two
// places that must never disagree: src/lib/settlement.js on a Tracker visit
// and netlify/functions/auto-settle.js on a schedule).
import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateLeg, evaluateEntry, evaluateEntryDetailed, voidAdjustedReturn, resolveSettlement, findGame, teamsMatch } from './betEvaluation.js'
import { getEachWayTerms, computeEachWayReturn } from '../utils/eachWay.js'

const games = [
  { homeTeam: 'Arsenal', awayTeam: 'Chelsea', scores: [{ name: 'Arsenal', score: 1 }, { name: 'Chelsea', score: 1 }] },
  { homeTeam: 'Spurs', awayTeam: 'Everton', scores: [{ name: 'Spurs', score: 3 }, { name: 'Everton', score: 0 }] }
]

const leg = (over) => ({ sport: 'football', event: 'Spurs v Everton', odds: 2, ...over })

test('1X2 reads the winner off the score', () => {
  assert.equal(evaluateLeg(leg({ market: '1X2', selection: 'Spurs' }), games), 'won')
  assert.equal(evaluateLeg(leg({ market: '1X2', selection: 'Everton' }), games), 'lost')
  assert.equal(evaluateLeg(leg({ market: '1X2', event: 'Arsenal v Chelsea', selection: 'Draw' }), games), 'won')
})

test('an unknown fixture stays undetermined rather than guessing', () => {
  assert.equal(evaluateLeg(leg({ market: '1X2', event: 'Leeds v Hull', selection: 'Leeds' }), games), 'undetermined')
})

test('totals settle against the line, and a push voids', () => {
  assert.equal(evaluateLeg(leg({ market: 'Over/Under 2.5', selection: 'Over 2.5' }), games), 'won')
  assert.equal(evaluateLeg(leg({ market: 'Over/Under 2.5', selection: 'Under 2.5' }), games), 'lost')
  // 3-0 lands exactly on an integer line - stake back, not a loss.
  assert.equal(evaluateLeg(leg({ market: 'Over/Under 3', selection: 'Over 3' }), games), 'void')
})

test('draw no bet voids on the draw', () => {
  assert.equal(evaluateLeg(leg({ market: 'Draw No Bet', event: 'Arsenal v Chelsea', selection: 'Arsenal' }), games), 'void')
  assert.equal(evaluateLeg(leg({ market: 'Draw No Bet', selection: 'Spurs' }), games), 'won')
})

test('both teams to score', () => {
  assert.equal(evaluateLeg(leg({ market: 'Both Teams to Score', selection: 'No' }), games), 'won')
  assert.equal(evaluateLeg(leg({ market: 'Both Teams to Score', event: 'Arsenal v Chelsea', selection: 'Yes' }), games), 'won')
})

// --- racing ---------------------------------------------------------------

const races = [{ raceId: 'r1', runners: [{ horseId: 'h1', name: 'Alpha', position: 1 }, { horseId: 'h2', name: 'Beta', position: 3 }] }]
const racingLeg = (over) => ({ sport: 'racing', raceId: 'r1', horseId: 'h1', selection: 'Alpha', odds: 3, ...over })

test('racing settles on finishing position', () => {
  assert.equal(evaluateLeg(racingLeg({}), [], races), 'won')
  assert.equal(evaluateLeg(racingLeg({ horseId: 'h2', selection: 'Beta' }), [], races), 'lost')
})

test('an each-way leg that finished in the places is placed, not lost', () => {
  const l = racingLeg({ horseId: 'h2', selection: 'Beta', eachWay: true, eachWayPlaces: 3, eachWayFraction: 0.25 })
  assert.equal(evaluateLeg(l, [], races), 'placed')
  // ...but only inside the paid places.
  assert.equal(evaluateLeg({ ...l, eachWayPlaces: 2 }, [], races), 'lost')
})

test('a horse missing from a finished race is a non-runner, so void', () => {
  assert.equal(evaluateLeg(racingLeg({ horseId: 'ghost', selection: 'Ghost' }), [], races), 'void')
})

test('a leg with no raceId falls back to manual rather than auto-voiding', () => {
  // Predates raceId tracking - it can never match, and must not age into the
  // abandoned-race timeout below and get voided regardless of its result.
  const old = { sport: 'racing', selection: 'Alpha', odds: 3, kickoff: new Date(Date.now() - 48 * 3600 * 1000).toISOString() }
  assert.equal(evaluateLeg(old, [], races), 'undetermined')
})

test('a race that never appears in results voids only after the grace period', () => {
  const base = { sport: 'racing', raceId: 'gone', horseId: 'h9', selection: 'Nine', odds: 3 }
  assert.equal(evaluateLeg({ ...base, kickoff: new Date(Date.now() - 60 * 1000).toISOString() }, [], races), 'undetermined')
  assert.equal(evaluateLeg({ ...base, kickoff: new Date(Date.now() - 7 * 3600 * 1000).toISOString() }, [], races), 'void')
})

// --- accumulators ---------------------------------------------------------

const entry = (stake, selections) => ({ stake, selections })

test('one confirmed loser sinks the multi without waiting on the rest', () => {
  const e = entry(10, [leg({ market: '1X2', selection: 'Everton' }), leg({ market: '1X2', event: 'Leeds v Hull', selection: 'Leeds' })])
  assert.equal(evaluateEntry(e, games, []), 'lost')
})

test('an unresolved leg leaves the multi open', () => {
  const e = entry(10, [leg({ market: '1X2', selection: 'Spurs' }), leg({ market: '1X2', event: 'Leeds v Hull', selection: 'Leeds' })])
  assert.equal(evaluateEntry(e, games, []), null)
})

test('a void leg does not block the multi from winning', () => {
  const e = entry(10, [leg({ market: 'Draw No Bet', event: 'Arsenal v Chelsea', selection: 'Arsenal' }), leg({ market: '1X2', selection: 'Spurs' })])
  assert.equal(evaluateEntry(e, games, []), 'won')
})

test('all legs void settles void', () => {
  assert.equal(evaluateEntry(entry(10, [leg({ market: 'Draw No Bet', event: 'Arsenal v Chelsea', selection: 'Arsenal' })]), games, []), 'void')
})

// --- void re-pricing ------------------------------------------------------

test('a winning multi with a void leg is re-priced without it', () => {
  // Struck at 2.0 x 1.5 = 3.0, so GBP 30. The 2.0 leg voided, so the bet is
  // really a GBP 10 single at 1.5 - paying the original GBP 30 pays out on a
  // leg that never ran.
  const e = entry(10, [
    leg({ market: 'Draw No Bet', event: 'Arsenal v Chelsea', selection: 'Arsenal', odds: 2 }),
    leg({ market: 'Over/Under 2.5', selection: 'Over 2.5', odds: 1.5 })
  ])
  const { status, outcomes } = evaluateEntryDetailed(e, games, [])
  assert.equal(status, 'won')
  assert.deepEqual(outcomes, ['void', 'won'])
  assert.equal(voidAdjustedReturn(e, outcomes), 15)
})

test('no void legs means no correction at all', () => {
  const e = entry(10, [leg({ market: '1X2', selection: 'Spurs' }), leg({ market: 'Over/Under 2.5', selection: 'Over 2.5' })])
  const { outcomes } = evaluateEntryDetailed(e, games, [])
  assert.equal(voidAdjustedReturn(e, outcomes), undefined)
})

test('an all-void bet needs no correction - the stake just comes back', () => {
  const e = entry(10, [leg({ market: 'Draw No Bet', event: 'Arsenal v Chelsea', selection: 'Arsenal' })])
  const { outcomes } = evaluateEntryDetailed(e, games, [])
  assert.equal(voidAdjustedReturn(e, outcomes), undefined)
})

test('re-priced returns round to 2dp', () => {
  const e = entry(10, [
    leg({ market: 'Draw No Bet', event: 'Arsenal v Chelsea', selection: 'Arsenal', odds: 2 }),
    leg({ market: '1X2', selection: 'Spurs', odds: 1.33 })
  ])
  const { outcomes } = evaluateEntryDetailed(e, games, [])
  assert.equal(voidAdjustedReturn(e, outcomes), 13.3)
})

// --- each-way terms -------------------------------------------------------

test('each-way terms follow field size, and under 5 runners has none', () => {
  assert.deepEqual(getEachWayTerms(20), { places: 4, fraction: 0.25 })
  assert.deepEqual(getEachWayTerms(12), { places: 3, fraction: 0.25 })
  assert.deepEqual(getEachWayTerms(8), { places: 3, fraction: 0.2 })
  assert.deepEqual(getEachWayTerms(5), { places: 2, fraction: 0.25 })
  assert.equal(getEachWayTerms(4), null)
})

test('each-way pays both parts on a win and the place part alone on a place', () => {
  const terms = { places: 3, fraction: 0.25 }
  // GBP 10 at 5.0: GBP 5 win part -> 25, GBP 5 place part at 1+(4*0.25)=2.0 -> 10.
  assert.equal(computeEachWayReturn(10, 5, terms, 'win'), 35)
  assert.equal(computeEachWayReturn(10, 5, terms, 'place'), 10)
  assert.equal(computeEachWayReturn(10, 5, terms, 'lose'), 0)
})

// --- resolveSettlement ------------------------------------------------------
// The single place both settle paths (src/lib/settlement.js and
// netlify/functions/auto-settle.js) turn an evaluated entry into what
// actually gets written. Deliberately entry-shape-agnostic - it never looks
// at entry.source/entry.table, which is what stops the two paths reaching
// different conclusions for the same bet.

test('an undetermined leg resolves to nothing settleable yet', () => {
  const e = entry(10, [leg({ market: '1X2', selection: 'Spurs' }), leg({ market: '1X2', event: 'Leeds v Hull', selection: 'Leeds' })])
  assert.equal(resolveSettlement(e, evaluateEntryDetailed(e, games, [])), null)
})

test('a plain loss or win carries no potentialReturn correction', () => {
  const lost = entry(10, [leg({ market: '1X2', selection: 'Everton' })])
  assert.deepEqual(resolveSettlement(lost, evaluateEntryDetailed(lost, games, [])), { status: 'lost', potentialReturnOverride: undefined })

  const won = entry(10, [leg({ market: '1X2', selection: 'Spurs' })])
  assert.deepEqual(resolveSettlement(won, evaluateEntryDetailed(won, games, [])), { status: 'won', potentialReturnOverride: undefined })
})

test('a winning multi with a void leg resolves with the re-priced return', () => {
  const e = entry(10, [
    leg({ market: 'Draw No Bet', event: 'Arsenal v Chelsea', selection: 'Arsenal', odds: 2 }),
    leg({ market: 'Over/Under 2.5', selection: 'Over 2.5', odds: 1.5 })
  ])
  assert.deepEqual(resolveSettlement(e, evaluateEntryDetailed(e, games, [])), { status: 'won', potentialReturnOverride: 15 })
})

// Regression test: an each-way leg that placed used to only resolve for
// manual_entries (see git history) - a bet_post left in this state stayed
// "open" forever, since nothing ever called resolveSettlement's bet_post
// path for a 'placed' result. resolveSettlement doesn't know or care what
// table the entry came from, so there is no such path to skip any more.
test('an each-way leg that placed resolves to won with the place-part return, regardless of source', () => {
  const l = racingLeg({ horseId: 'h2', selection: 'Beta', eachWay: true, eachWayPlaces: 3, eachWayFraction: 0.25 })
  const e = entry(10, [l])
  const resolved = resolveSettlement(e, evaluateEntryDetailed(e, [], races))
  assert.equal(resolved.status, 'won')
  assert.equal(resolved.potentialReturnOverride, computeEachWayReturn(10, l.odds, { fraction: 0.25, places: 3 }, 'place'))
})

test('an all-void bet resolves to void with no correction', () => {
  const e = entry(10, [leg({ market: 'Draw No Bet', event: 'Arsenal v Chelsea', selection: 'Arsenal' })])
  assert.deepEqual(resolveSettlement(e, evaluateEntryDetailed(e, games, [])), { status: 'void', potentialReturnOverride: undefined })
})

// --- tolerant team-name matching (stuck-pending fix) --------------------------
// A bet logged manually or via OCR can spell teams differently from the scores
// feed; findGame/evaluateLeg now match on normalised names so those still settle
// instead of sitting 'pending' forever.

test('teamsMatch tolerates club suffixes and city abbreviations', () => {
  assert.ok(teamsMatch('Houston Dynamo FC', 'Houston Dynamo'))
  assert.ok(teamsMatch('LA Galaxy', 'Los Angeles Galaxy'))
  assert.ok(teamsMatch('Spurs', 'Spurs'))
  assert.ok(!teamsMatch('Manchester United', 'Manchester City'))
  assert.ok(!teamsMatch('Arsenal', 'Aston Villa'))
})

test('findGame matches near-miss spellings but needs BOTH teams to line up', () => {
  const mlsGames = [
    { homeTeam: 'Houston Dynamo FC', awayTeam: 'Los Angeles Galaxy', scores: [{ name: 'Houston Dynamo FC', score: 2 }, { name: 'Los Angeles Galaxy', score: 1 }] }
  ]
  // Bet stored the shorter/abbreviated names - still finds the game.
  assert.ok(findGame({ event: 'Houston Dynamo v LA Galaxy' }, mlsGames))
  // One team right, the other a different club -> no false match.
  assert.equal(findGame({ event: 'Houston Dynamo v New York City' }, mlsGames), undefined)
})

test('a near-miss MLS bet settles instead of staying pending', () => {
  const mlsGames = [
    { homeTeam: 'Houston Dynamo FC', awayTeam: 'Los Angeles Galaxy', scores: [{ name: 'Houston Dynamo FC', score: 2 }, { name: 'Los Angeles Galaxy', score: 1 }] }
  ]
  const bet = { sport: 'football', event: 'Houston Dynamo v LA Galaxy', market: '1X2', odds: 2 }
  assert.equal(evaluateLeg({ ...bet, selection: 'Houston Dynamo' }, mlsGames), 'won')
  assert.equal(evaluateLeg({ ...bet, selection: 'LA Galaxy' }, mlsGames), 'lost')
})
