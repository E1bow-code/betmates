import { test } from 'node:test'
import assert from 'node:assert/strict'
import { closingKey, legClv, legClvFromMap, betClv, clvSummary, closingLinesFromSnapshots } from './clv.js'

const leg = (over) => ({ eventId: 'e1', marketKey: 'h2h', outcomeName: 'Home', odds: 2.0, ...over })
const single = (over) => ({ selections: [leg(over)] })

test('beating the close is positive CLV', () => {
  // Struck 2.0, market closed shorter at 1.8 - you got the bigger price.
  const clv = legClv(leg(), 1.8)
  assert.equal(clv.beat, true)
  assert.ok(clv.deltaPct > 0)
  assert.equal(clv.bet, 2.0)
  assert.equal(clv.close, 1.8)
})

test('a price worse than the close is negative CLV', () => {
  const clv = legClv(leg({ odds: 1.8 }), 2.0)
  assert.equal(clv.beat, false)
  assert.ok(clv.deltaPct < 0)
})

test('matching the close is zero CLV and not a beat', () => {
  const clv = legClv(leg(), 2.0)
  assert.equal(clv.beat, false)
  assert.equal(clv.deltaPct, 0)
})

test('missing or unusable prices give null, not a bogus number', () => {
  assert.equal(legClv(leg(), null), null)
  assert.equal(legClv(leg(), 0), null)
  assert.equal(legClv(leg({ odds: null }), 1.8), null)
  assert.equal(legClv(leg({ odds: -1 }), 1.8), null)
})

test('closingKey matches how a leg looks up its own close', () => {
  assert.equal(closingKey('e1', 'h2h', 'Home'), 'e1|h2h|Home')
})

test('legClvFromMap resolves the close by leg identity', () => {
  const closes = { 'e1|h2h|Home': 1.8 }
  const clv = legClvFromMap(leg(), closes)
  assert.equal(clv.beat, true)
})

test('legClvFromMap is null without identity keys or a recorded close', () => {
  assert.equal(legClvFromMap(leg({ eventId: undefined }), { 'e1|h2h|Home': 1.8 }), null)
  assert.equal(legClvFromMap(leg(), {}), null)
})

test('only single-leg bets get a CLV verdict', () => {
  const closes = { 'e1|h2h|Home': 1.8, 'e2|h2h|Away': 3.0 }
  assert.ok(betClv(single(), closes))
  const multi = { selections: [leg(), leg({ eventId: 'e2', outcomeName: 'Away', odds: 3.5 })] }
  assert.equal(betClv(multi, closes), null)
})

test('clvSummary needs a minimum sample before it reports', () => {
  const closes = { 'e1|h2h|Home': 1.8 }
  assert.equal(clvSummary([single(), single()], closes, 3), null)
})

test('clvSummary reports average CLV, beat rate and sample - which can diverge', () => {
  // Three singles: two beat the close (2.0 vs 1.8 = +11.1% each), one missed
  // badly (1.5 vs 2.0 = -25%). Beat rate is 67%, but the single big miss drags
  // the average CLV slightly negative - so a high beat rate does NOT guarantee
  // positive average CLV, and the summary must surface both honestly.
  const closes = { 'e1|h2h|Home': 1.8, 'e2|h2h|Home': 1.8, 'e3|h2h|Home': 2.0 }
  const entries = [
    { selections: [leg()] },
    { selections: [leg({ eventId: 'e2' })] },
    { selections: [leg({ eventId: 'e3', odds: 1.5 })] }
  ]
  const summary = clvSummary(entries, closes, 3)
  assert.equal(summary.sample, 3)
  assert.equal(summary.beatRate, 67) // 2 of 3 beat the close
  assert.equal(summary.avgPct, -0.93) // (11.11 + 11.11 - 25) / 3, rounded to 2dp
})

test('clvSummary ignores entries with no recorded close', () => {
  const closes = { 'e1|h2h|Home': 1.8 } // only e1 has a close
  const entries = [
    { selections: [leg()] },
    { selections: [leg({ eventId: 'e2' })] }, // no close - skipped
    { selections: [leg({ eventId: 'e3' })] } // no close - skipped
  ]
  // Only one comparable entry, below the default minSample of 3.
  assert.equal(clvSummary(entries, closes), null)
})

test('closingLinesFromSnapshots takes the latest price at or before kickoff', () => {
  const kickoffs = { fx1: '2026-08-01T15:00:00Z' }
  const snaps = [
    { fixture_id: 'fx1', market: 'h2h', selection: 'Home', odds: 2.0, fetched_at: '2026-08-01T10:00:00Z' },
    { fixture_id: 'fx1', market: 'h2h', selection: 'Home', odds: 1.9, fetched_at: '2026-08-01T14:30:00Z' }, // latest pre-KO -> the close
    { fixture_id: 'fx1', market: 'h2h', selection: 'Home', odds: 1.5, fetched_at: '2026-08-01T15:30:00Z' } // after KO -> ignored
  ]
  const closes = closingLinesFromSnapshots(snaps, kickoffs)
  assert.equal(closes['fx1|h2h|Home'], 1.9)
})

test('closingLinesFromSnapshots keeps the latest as provisional when kickoff is unknown', () => {
  // No kickoff for this fixture -> nothing is "after kickoff", so the newest
  // recorded price stands in as the close.
  const snaps = [
    { fixture_id: 'fxX', market: 'h2h', selection: 'Away', odds: 3.0, fetched_at: '2026-08-01T10:00:00Z' },
    { fixture_id: 'fxX', market: 'h2h', selection: 'Away', odds: 2.7, fetched_at: '2026-08-01T12:00:00Z' }
  ]
  const closes = closingLinesFromSnapshots(snaps, {})
  assert.equal(closes['fxX|h2h|Away'], 2.7)
})
