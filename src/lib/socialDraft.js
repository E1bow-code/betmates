// Coco's copywriter: composes a short daily promo post for BetMates from
// real, already-available data. Deliberately pure and I/O-free (like
// betEvaluation.js) so `npm test` covers it and social-propose.js can import
// it straight out of src/lib. No LLM call here - a deterministic template
// keeps drafts testable and free; the operator is the editorial gate (every
// draft is proposed for Approve/Reject before it can post).
//
// The app never places real bets and is trust-based/self-logged, so the copy
// stays hype-and-community, never a betting tip or a "guaranteed" claim.

const HANDLE = '#BetMates'

/**
 * Round a number to at most 2dp without trailing zeros ("12.5", not "12.50").
 * @param {number} n
 */
function money(n) {
  return (Math.round(n * 100) / 100).toString()
}

/**
 * Build the day's promo post from whatever signals are available. Every field
 * is optional; the draft uses the richest angle it has and always returns a
 * non-empty string so a caller never has to handle an empty post.
 *
 * @param {object} [data]
 * @param {{ name?: string, profit?: number } | null} [data.topMember]  leaderboard leader over the window
 * @param {{ w: number, l: number } | null} [data.coachRecord]  CoachGPT's W-L
 * @param {{ home: string, away: string, kickoff?: string } | null} [data.nextMatch]  a headline upcoming fixture
 * @param {number} [data.groupCount]  how many active groups, for a community angle
 * @returns {string} the drafted post (<= 280 chars, X's limit)
 */
export function buildDailyPost(data = {}) {
  const { topMember, coachRecord, nextMatch, groupCount } = data
  const lines = []

  if (topMember && topMember.name) {
    const profit = typeof topMember.profit === 'number'
      ? ` (${topMember.profit >= 0 ? '+' : '-'}£${money(Math.abs(topMember.profit))})`
      : ''
    lines.push(`🏆 ${topMember.name} is topping the leaderboard${profit}. Can your mates catch them this week?`)
  }

  if (nextMatch && nextMatch.home && nextMatch.away) {
    lines.push(`⚽ ${nextMatch.home} v ${nextMatch.away} coming up - log your slip and settle the score with the group.`)
  }

  if (coachRecord && (coachRecord.w || coachRecord.l)) {
    lines.push(`🧠 CoachGPT is ${coachRecord.w}-${coachRecord.l}. Think you can beat the bot?`)
  }

  // Community fallback so there is always something to say on a quiet day.
  if (!lines.length) {
    const groups = typeof groupCount === 'number' && groupCount > 0
      ? `${groupCount} group${groupCount === 1 ? ' is' : 's are'}`
      : 'Mates are'
    lines.push(`📱 ${groups} tracking their bets, comparing odds and settling scores on BetMates. Start a group and get among it.`)
  }

  // Lead with the single strongest angle, then the hashtag - keeps it tight
  // and well under X's 280-char limit.
  let post = `${lines[0]} ${HANDLE}`
  if (post.length > 280) post = `${post.slice(0, 280 - (HANDLE.length + 2)).trimEnd()}… ${HANDLE}`
  return post
}
