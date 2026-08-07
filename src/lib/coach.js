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

export const COACH_MODEL = 'claude-opus-5'
const ANTHROPIC_VERSION = '2023-06-01'

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

// Ask Claude for a take. Returns the text, or null for any reason it can't be
// produced (no key, empty summary, upstream error) - callers treat null as
// "no take to show" and carry on, never surfacing an error.
export async function requestCoachTake({ summary, apiKey, style = 'full' }) {
  if (!apiKey) return null
  const brief = coachBriefing(summary ?? {})
  if (!brief) return null

  const system = style === 'push' ? COACH_PUSH_SYSTEM : COACH_SYSTEM
  const maxTokens = style === 'push' ? 120 : 350

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION
      },
      body: JSON.stringify({
        model: COACH_MODEL,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: `Here is the record:\n\n${brief}\n\nGive me your take.` }]
      })
    })
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
