import test from 'node:test'
import assert from 'node:assert/strict'

// bookmakerScoreboard.js imports betLineValue, which reads recorded price
// history out of localStorage (via src/lib/oddsMemory.js) - same stub as
// lineValue.test.js, left empty here since these cases don't need it.
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
}

const { computeBookmakerScoreboard, MIN_SETTLED_TO_RANK } = await import('./bookmakerScoreboard.js')

const leg = (over) => ({ event: 'e', market: 'm', selection: 's', odds: 2.0, bookmaker: 'Bet365', ...over })
const entry = (over) => ({
  selections: [leg(over.leg)],
  stake: 10,
  status: 'won',
  potentialReturn: 20,
  ...over
})

test('computeBookmakerScoreboard ranks by ROI, sharpest first', () => {
  const entries = [
    // Bet365: 3 wins -> +£30 on £30 -> ROI +100%
    entry({ leg: { bookmaker: 'Bet365' } }),
    entry({ leg: { bookmaker: 'Bet365' } }),
    entry({ leg: { bookmaker: 'Bet365' } }),
    // Sky Bet: 1 win, 2 losses -> -£10 on £30 -> ROI -33%
    entry({ leg: { bookmaker: 'Sky Bet' } }),
    entry({ leg: { bookmaker: 'Sky Bet' }, status: 'lost', potentialReturn: 0 }),
    entry({ leg: { bookmaker: 'Sky Bet' }, status: 'lost', potentialReturn: 0 })
  ]
  const ranked = computeBookmakerScoreboard(entries)
  assert.equal(ranked.length, 2)
  assert.equal(ranked[0].bookmaker, 'Bet365')
  assert.equal(ranked[0].roi, 100)
  assert.equal(ranked[1].bookmaker, 'Sky Bet')
  assert.ok(ranked[0].roi > ranked[1].roi)
})

test('computeBookmakerScoreboard drops bookmakers below the minimum settled sample', () => {
  const entries = Array.from({ length: MIN_SETTLED_TO_RANK - 1 }, () => entry({}))
  assert.deepEqual(computeBookmakerScoreboard(entries), [])
})

test('computeBookmakerScoreboard ignores stake-hidden bets (no visible P&L)', () => {
  const entries = [entry({}), entry({}), entry({ stakeHidden: true })]
  // Only 2 visible settled -> below the threshold -> unranked.
  assert.deepEqual(computeBookmakerScoreboard(entries), [])
})

test('computeBookmakerScoreboard excludes multi-leg bets - no single bookmaker to credit', () => {
  const entries = [
    entry({ selections: [leg({ bookmaker: 'Bet365' }), leg({ bookmaker: 'Sky Bet' })] }),
    entry({ leg: { bookmaker: 'Bet365' } }),
    entry({ leg: { bookmaker: 'Bet365' } }),
    entry({ leg: { bookmaker: 'Bet365' } })
  ]
  const ranked = computeBookmakerScoreboard(entries)
  assert.equal(ranked.length, 1)
  assert.equal(ranked[0].settledCount, 3) // the 2-leg bet never counted toward Bet365 or Sky Bet
})

test('computeBookmakerScoreboard is safe on empty or missing input', () => {
  assert.deepEqual(computeBookmakerScoreboard([]), [])
  assert.deepEqual(computeBookmakerScoreboard(null), [])
})
