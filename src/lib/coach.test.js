import test from 'node:test'
import assert from 'node:assert/strict'
import { betBriefing, groupBriefing } from './coach.js'

test('betBriefing describes a single-leg won bet with its return', () => {
  const bet = {
    selections: [{ event: 'Arsenal v Chelsea', market: 'Match Result', selection: 'Arsenal to win', odds: 2.1, bookmaker: 'Bet365' }],
    stake: 10,
    potentialReturn: 21,
    status: 'won'
  }
  const brief = betBriefing(bet)
  assert.match(brief, /Arsenal to win \(Match Result, Arsenal v Chelsea\) @ 2\.10 \(Bet365\)/)
  assert.match(brief, /Stake: £10\.00/)
  assert.match(brief, /Result: Won/)
  assert.match(brief, /Returned: £21\.00/)
})

test('betBriefing lists every leg and the combined odds for a multi-leg bet, no return line when lost', () => {
  const bet = {
    selections: [
      { event: 'A v B', market: 'Match Result', selection: 'A to win', odds: 2 },
      { event: 'C v D', market: 'Match Result', selection: 'D to win', odds: 1.5 }
    ],
    stake: 5,
    potentialReturn: 15,
    status: 'lost'
  }
  const brief = betBriefing(bet)
  assert.match(brief, /2-leg bet:/)
  assert.match(brief, /1\. A to win \(Match Result, A v B\) @ 2\.00/)
  assert.match(brief, /2\. D to win \(Match Result, C v D\) @ 1\.50/)
  assert.match(brief, /Combined odds: 3\.00/)
  assert.match(brief, /Result: Lost/)
  assert.doesNotMatch(brief, /Returned/)
})

test('betBriefing has no Returned line for a void bet', () => {
  const brief = betBriefing({
    selections: [{ event: 'A v B', market: 'Match Result', selection: 'A to win', odds: 2, bookmaker: 'Bet365' }],
    stake: 10,
    potentialReturn: 10,
    status: 'void'
  })
  assert.match(brief, /Result: Void/)
  assert.doesNotMatch(brief, /Returned/)
})

test('betBriefing labels a placed each-way result and still shows the return', () => {
  const brief = betBriefing({
    selections: [{ event: 'The Derby', market: 'Each Way', selection: 'Horse X', odds: 8, bookmaker: 'Bet365' }],
    stake: 5,
    potentialReturn: 8,
    status: 'placed'
  })
  assert.match(brief, /Result: Placed \(each-way, not the win\)/)
  assert.match(brief, /Returned: £8\.00/)
})

test('groupBriefing includes the top tipster and biggest win when present', () => {
  const brief = groupBriefing({
    settledCount: 6,
    activeCount: 3,
    groupProfit: 42.5,
    topTipster: { name: 'Sam', profit: 30, settledCount: 4, winRate: 75 },
    biggestWin: { name: 'Sam', profit: 25, event: 'Arsenal v Chelsea', legs: 1 }
  })
  assert.match(brief, /Bets settled this week: 6/)
  assert.match(brief, /Mates who bet this week: 3/)
  assert.match(brief, /Group P&L: \+£42\.50/)
  assert.match(brief, /Top tipster: Sam \(\+£30\.00 over 4 bets, 75% win rate\)/)
  assert.match(brief, /Biggest win: Sam \+£25\.00 on Arsenal v Chelsea/)
})

test('groupBriefing skips the biggest-win line when nobody won a bet', () => {
  const brief = groupBriefing({
    settledCount: 2,
    activeCount: 2,
    groupProfit: -12,
    topTipster: { name: 'Jo', profit: -4, settledCount: 1, winRate: 0 },
    biggestWin: null
  })
  assert.doesNotMatch(brief, /Biggest win/)
  assert.match(brief, /Group P&L: £-12\.00|Group P&L: -£12\.00/)
})
