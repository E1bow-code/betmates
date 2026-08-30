import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reshapeEvent, reshapePlayerMarkets, reshapeExtraMarkets, EXTRA_MARKET_LABELS } from './footballOddsShape.js'

// Fixtures mirror The Odds API's shape: an event with bookmakers[].markets[].outcomes[].
const bm = (title, markets, link) => ({ title, link: link ?? null, markets })
const mkt = (key, outcomes, link) => ({ key, outcomes, link: link ?? null })

const event = {
  id: 'evt1',
  sport_title: 'EPL',
  sport_key: 'soccer_epl',
  home_team: 'Arsenal',
  away_team: 'Chelsea',
  commence_time: '2026-09-01T14:00:00Z',
  bookmakers: [
    bm('Sky Bet', [
      mkt('h2h', [
        { name: 'Arsenal', price: 2.1, link: 'https://sky/slip' }, // outcome-level link -> betslip
        { name: 'Chelsea', price: 3.4 },
        { name: 'Draw', price: 3.2 }
      ]),
      mkt('totals', [{ name: 'Over', price: 1.9 }, { name: 'Under', price: 1.95 }])
    ]),
    bm('Bet365', [
      mkt('h2h', [
        { name: 'Arsenal', price: 2.2 }, // better home price than Sky
        { name: 'Chelsea', price: 3.3 },
        { name: 'Draw', price: 3.25 }
      ])
    ])
  ]
}

test('reshapeEvent maps the top-level fields off the provider payload', () => {
  const r = reshapeEvent(event)
  assert.equal(r.id, 'evt1')
  assert.equal(r.competition, 'EPL')
  assert.equal(r.sportKey, 'soccer_epl')
  assert.equal(r.homeTeam, 'Arsenal')
  assert.equal(r.awayTeam, 'Chelsea')
  assert.equal(r.kickoff, '2026-09-01T14:00:00Z')
  assert.equal(r.status, 'scheduled')
})

test('reshapeEvent normalises h2h names to Home/Away/Draw and sets teams', () => {
  const h2h = reshapeEvent(event).markets.find((m) => m.key === 'h2h')
  assert.equal(h2h.label, '1X2')
  const names = h2h.outcomes.map((o) => o.name).sort()
  assert.deepEqual(names, ['Away', 'Draw', 'Home'])
  const home = h2h.outcomes.find((o) => o.name === 'Home')
  const away = h2h.outcomes.find((o) => o.name === 'Away')
  const draw = h2h.outcomes.find((o) => o.name === 'Draw')
  assert.equal(home.team, 'Arsenal')
  assert.equal(away.team, 'Chelsea')
  assert.equal(draw.team, null)
})

test('reshapeEvent merges bookmakers per outcome: allOdds sorted desc, bestOdds is the max', () => {
  const home = reshapeEvent(event).markets.find((m) => m.key === 'h2h').outcomes.find((o) => o.name === 'Home')
  assert.deepEqual(home.allOdds.map((o) => o.decimal), [2.2, 2.1]) // sorted high -> low
  assert.equal(home.bestOdds.decimal, 2.2)
  assert.equal(home.bestOdds.bookmaker, 'Bet365')
})

test('reshapeEvent carries the pickLink fields, flagging an outcome-level betslip link', () => {
  const home = reshapeEvent(event).markets.find((m) => m.key === 'h2h').outcomes.find((o) => o.name === 'Home')
  const sky = home.allOdds.find((o) => o.bookmaker === 'Sky Bet')
  assert.equal(sky.link, 'https://sky/slip')
  assert.equal(sky.isBetslipLink, true) // outcome.link present
  const bet365 = home.allOdds.find((o) => o.bookmaker === 'Bet365')
  assert.equal(bet365.link, null)
  assert.equal(bet365.isBetslipLink, false)
})

test('reshapeEvent gives totals its 2.5 label, and drops a market that no book prices', () => {
  const r = reshapeEvent(event)
  assert.equal(r.markets.find((m) => m.key === 'totals').label, 'Over/Under 2.5 Goals')
  // An event whose only market is unrelated yields no 1X2/totals markets at all.
  const empty = reshapeEvent({ ...event, bookmakers: [bm('X', [mkt('spreads', [{ name: 'Arsenal', price: 2 }])])] })
  assert.deepEqual(empty.markets, [])
})

test('reshapeEvent tolerates a missing bookmakers array', () => {
  assert.deepEqual(reshapeEvent({ ...event, bookmakers: undefined }).markets, [])
})

test('reshapePlayerMarkets labels the market and names outcomes by description then name', () => {
  const ev = {
    home_team: 'A',
    away_team: 'B',
    bookmakers: [
      bm('Sky', [
        mkt('player_goal_scorer_anytime', [
          { name: 'Yes', description: 'Bukayo Saka', price: 2.5 },
          { name: 'Cole Palmer', price: 3.0 }, // no description -> name used
          { price: 4.0 } // neither name nor description -> skipped
        ])
      ])
    ]
  }
  const markets = reshapePlayerMarkets(ev)
  assert.equal(markets.length, 1)
  assert.equal(markets[0].label, 'Anytime Goalscorer')
  assert.deepEqual(markets[0].outcomes.map((o) => o.name).sort(), ['Bukayo Saka', 'Cole Palmer'])
})

test('reshapeExtraMarkets: btts and draw_no_bet keep/normalise names as expected', () => {
  const ev = {
    home_team: 'Arsenal',
    away_team: 'Chelsea',
    bookmakers: [
      bm('Sky', [
        mkt('btts', [{ name: 'Yes', price: 1.8 }, { name: 'No', price: 1.9 }]),
        mkt('draw_no_bet', [{ name: 'Arsenal', price: 1.5 }, { name: 'Chelsea', price: 2.4 }])
      ])
    ]
  }
  const markets = reshapeExtraMarkets(ev)
  const btts = markets.find((m) => m.key === 'btts')
  assert.equal(btts.label, EXTRA_MARKET_LABELS.btts)
  assert.deepEqual(btts.outcomes.map((o) => o.name).sort(), ['No', 'Yes'])
  const dnb = markets.find((m) => m.key === 'draw_no_bet')
  assert.deepEqual(dnb.outcomes.map((o) => o.name).sort(), ['Away', 'Home'])
  assert.equal(dnb.outcomes.find((o) => o.name === 'Home').team, 'Arsenal')
})

test('reshapeExtraMarkets folds the line into alternate_totals names and drops out-of-range lines', () => {
  const ev = {
    home_team: 'A',
    away_team: 'B',
    bookmakers: [
      bm('Sky', [
        mkt('alternate_totals', [
          { name: 'Over', point: 2.5, price: 1.9 },
          { name: 'Under', point: 2.5, price: 1.9 },
          { name: 'Over', point: 0.5, price: 1.1 }, // below ALT_TOTALS_MIN_LINE -> dropped
          { name: 'Over', point: 5.5, price: 6.0 } // above ALT_TOTALS_MAX_LINE -> dropped
        ])
      ])
    ]
  }
  const alt = reshapeExtraMarkets(ev).find((m) => m.key === 'alternate_totals')
  assert.deepEqual(alt.outcomes.map((o) => o.name), ['Over 2.5', 'Under 2.5']) // numeric sort, in-range only
})
