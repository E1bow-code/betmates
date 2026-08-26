// Shared Coach logic - the prompt, the briefing and the Claude call - so the
// on-demand "Coach's take" (netlify/functions/coach.js) and the weekly coach
// push (netlify/functions/weekly-recap.js) speak with one voice and can't
// drift apart. No DOM, no storage: summary in -> text out, so it's safe to
// import straight into a Netlify Function (same reason betEvaluation.js stays
// I/O-light).
//
// The never-tip framing is the whole point and lives here once: the Coach
// reflects the record that already exists and is prompted never to predict a
// result or suggest a bet, in keeping with BetMates' trust-based,
// never-places-real-bets design.

import { buildAnthropicRequest } from './anthropicRoute.js'

export const COACH_MODEL = 'claude-opus-5'

// Turn a rolled-up summary object into a compact, model-friendly briefing.
// Every field is optional - a brand-new user might only have a couple - so
// each line is guarded and skipped when absent.
export function coachBriefing(s) {
  const lines = []
  if (Number.isFinite(s.settled)) lines.push(`Settled bets: ${s.settled}`)
  if (Number.isFinite(s.winRate)) lines.push(`Win rate: ${s.winRate}%`)
  if (Number.isFinite(s.profit)) lines.push(`Net P&L: ${s.profit >= 0 ? '+' : ''}£${s.profit.toFixed(2)}`)
  if (Number.isFinite(s.roi)) lines.push(`ROI: ${s.roi >= 0 ? '+' : ''}${s.roi.toFixed(1)}%`)
  if (Number.isFinite(s.avgStake)) lines.push(`Average stake: £${s.avgStake.toFixed(2)}`)
  if (Number.isFinite(s.biggestStake)) lines.push(`Biggest single stake: £${s.biggestStake.toFixed(2)}`)
  if (s.topSport) lines.push(`Most profitable sport: ${s.topSport}`)
  if (s.worstSport) lines.push(`Least profitable sport: ${s.worstSport}`)
  if (s.topMarket) lines.push(`Best market by win rate: ${s.topMarket}`)
  if (s.favBookmaker) lines.push(`Most used bookmaker: ${s.favBookmaker}`)
  if (Number.isFinite(s.avgOdds)) lines.push(`Average odds taken: ${s.avgOdds.toFixed(2)}`)
  if (Number.isFinite(s.accaShare)) lines.push(`Share of bets that are accumulators: ${s.accaShare}%`)
  if (Number.isFinite(s.currentStreak) && s.currentStreak !== 0)
    lines.push(`Current streak: ${Math.abs(s.currentStreak)} ${s.currentStreak > 0 ? 'wins' : 'losses'} in a row`)
  return lines.join('\n')
}

// Same idea as coachBriefing but for ONE settled bet rather than a whole
// record - used by "bet review" (Tracker's on-request "Ask Coach" button).
// Takes the plain bet-shaped object Tracker/localBackend already use
// (selections/stake/potentialReturn/status), not a rolled-up summary.
const RESULT_WORD = { won: 'Won', lost: 'Lost', void: 'Void', placed: 'Placed (each-way, not the win)' }

export function betBriefing(bet) {
  const lines = []
  const legs = bet.selections ?? []
  if (legs.length === 1) {
    const leg = legs[0]
    lines.push(`Selection: ${leg.selection} (${leg.market}, ${leg.event}) @ ${Number(leg.odds).toFixed(2)} (${leg.bookmaker})`)
  } else if (legs.length > 1) {
    lines.push(`${legs.length}-leg bet:`)
    legs.forEach((leg, i) => lines.push(`  ${i + 1}. ${leg.selection} (${leg.market}, ${leg.event}) @ ${Number(leg.odds).toFixed(2)}`))
    const combined = legs.reduce((acc, l) => acc * Number(l.odds), 1)
    lines.push(`Combined odds: ${combined.toFixed(2)}`)
  }
  if (Number.isFinite(Number(bet.stake))) lines.push(`Stake: £${Number(bet.stake).toFixed(2)}`)
  if (bet.status && RESULT_WORD[bet.status]) lines.push(`Result: ${RESULT_WORD[bet.status]}`)
  if ((bet.status === 'won' || bet.status === 'placed') && Number.isFinite(Number(bet.potentialReturn)))
    lines.push(`Returned: £${Number(bet.potentialReturn).toFixed(2)}`)
  return lines.join('\n')
}

// Turns a group's weekly recap (src/utils/groupRecap.js's computeGroupRecap
// output - already shown numerically on GroupRecapCard) into a briefing for
// the group-level Coach take. Same "reflect what's already there" contract.
export function groupBriefing(recap) {
  const lines = []
  if (Number.isFinite(recap.settledCount)) lines.push(`Bets settled this week: ${recap.settledCount}`)
  if (Number.isFinite(recap.activeCount)) lines.push(`Mates who bet this week: ${recap.activeCount}`)
  if (Number.isFinite(recap.groupProfit)) lines.push(`Group P&L: ${recap.groupProfit >= 0 ? '+' : ''}£${recap.groupProfit.toFixed(2)}`)
  if (recap.topTipster) {
    const t = recap.topTipster
    lines.push(
      `Top tipster: ${t.name} (${t.profit >= 0 ? '+' : ''}£${t.profit.toFixed(2)} over ${t.settledCount} bet${t.settledCount === 1 ? '' : 's'}${t.winRate == null ? '' : `, ${t.winRate}% win rate`})`
    )
  }
  if (recap.biggestWin) {
    const b = recap.biggestWin
    lines.push(`Biggest win: ${b.name} +£${b.profit.toFixed(2)}${b.event ? ` on ${b.legs > 1 ? `a ${b.legs}-leg bet` : b.event}` : ''}`)
  }
  return lines.join('\n')
}

// The rules both voices share. Only the length/context differs between the
// full Insights card and the one-line push.
const HARD_RULES = [
  '- Never predict a result, name a team/player to back, or suggest a bet. You',
  '  reflect the record that already exists; you do not tip.',
  '- Focus on habits and discipline: staking consistency, chasing losses,',
  '  favourite markets, where the record is strong vs weak, bankroll sense.',
  '- Be candid but kind. If the record is losing, say so plainly and gently.',
  '- Keep it grounded in the numbers you were given. Do not invent figures.'
].join('\n')

const PREAMBLE = [
  'You are the "Coach" inside BetMates, a social betting tracker. Users log',
  'their own bets; the app never places real bets and shows no live money.',
  'You are given a summary of ONE user\'s betting record and write them a short,',
  'friendly, honest read on it.',
  '',
  'Hard rules:',
  HARD_RULES
].join('\n')

export const COACH_SYSTEM = [
  PREAMBLE,
  '- If the numbers look like heavy or escalating betting, work in a light,',
  '  non-preachy nudge toward the safer-gambling tools in the app.',
  '',
  'Format: 2-4 short sentences (or up to 3 tight bullet points). No preamble,',
  'no sign-off, no emoji spam - at most one. British English, pub-mate tone.'
].join('\n')

// The push voice: the same read, compressed to a single notification-sized
// line. The summary it's handed covers THIS WEEK, so it speaks to the week.
export const COACH_PUSH_SYSTEM = [
  PREAMBLE,
  '',
  'This summary is the user\'s LAST 7 DAYS. Write ONE punchy sentence (max ~140',
  'characters) they can read on a lock screen - the single most useful thing',
  'about how they bet this week. No preamble, no emoji, British English.'
].join('\n')

// "Bet review" - a reaction to ONE of the user's own settled bets, on request
// (Tracker's "Ask Coach" button), not their whole record.
const BET_PREAMBLE = [
  'You are the "Coach" inside BetMates, a social betting tracker. Users log',
  'their own bets; the app never places real bets and shows no live money.',
  'You are given the details of ONE of the user\'s own settled bets (already',
  'won, lost or void) and write a short, honest reaction to it - the pick,',
  'the price, and the stake.',
  '',
  'Hard rules:',
  HARD_RULES
].join('\n')

export const COACH_BET_SYSTEM = [
  BET_PREAMBLE,
  '',
  'Format: 1-3 short sentences. No preamble, no sign-off, at most one emoji.',
  'British English, pub-mate tone. Speak to this one bet only - you have not',
  'been given their overall record, so don\'t guess at it.'
].join('\n')

// "Group Coach" - a take on a group's week together (fed the same numbers
// GroupRecapCard already shows), not any one member's individual record.
const GROUP_PREAMBLE = [
  'You are the "Coach" inside BetMates, a social betting tracker. Users log',
  'their own bets in shared groups with mates; the app never places real bets.',
  'You are given a GROUP\'s numbers for the last 7 days and write the group a',
  'short, friendly take on their week together.',
  '',
  'Hard rules:',
  HARD_RULES
].join('\n')

export const COACH_GROUP_SYSTEM = [
  GROUP_PREAMBLE,
  '- Speak to the group as a whole ("you lot", "the group") - don\'t single',
  '  anyone out beyond the top tipster/biggest win you were given.',
  '',
  'Format: 2-3 short sentences. No preamble, no sign-off, at most one emoji.',
  'British English, pub-mate tone.'
].join('\n')

// Ask Claude for a take. Returns the text, or null for any reason it can't be
// produced (no key, empty briefing, upstream error) - callers treat null as
// "no take to show" and carry on, never surfacing an error.
export async function requestCoachTake({ summary, bet, recap, apiKey, style = 'full', route }) {
  if (!apiKey) return null
  const brief = style === 'bet' ? betBriefing(bet ?? {}) : style === 'group' ? groupBriefing(recap ?? {}) : coachBriefing(summary ?? {})
  if (!brief) return null

  const system = style === 'push' ? COACH_PUSH_SYSTEM : style === 'bet' ? COACH_BET_SYSTEM : style === 'group' ? COACH_GROUP_SYSTEM : COACH_SYSTEM
  const maxTokens = style === 'push' ? 120 : style === 'bet' ? 150 : style === 'group' ? 250 : 350

  try {
    const { url, headers, body } = buildAnthropicRequest(apiKey, COACH_MODEL, {
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: `Here is the record:\n\n${brief}\n\nGive me your take.` }]
    }, route)
    const res = await fetch(url, { method: 'POST', headers, body })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      console.error(`coach: Anthropic ${res.status}: ${detail.slice(0, 300)}`)
      return null
    }
    const data = await res.json()
    return data?.content?.find((b) => b.type === 'text')?.text?.trim() ?? null
  } catch (err) {
    console.error('coach: request failed:', err.message)
    return null
  }
}
