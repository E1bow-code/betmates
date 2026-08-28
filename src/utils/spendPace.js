// A neutral spend-awareness mirror for a tracker (not a bookmaker): how much
// the user has staked in the last 7 days next to their own typical recent
// week. Deliberately factual and judgment-free - it just lets someone see
// their own pace. Returns null until there's a prior-weeks baseline to compare
// against, so a brand-new account isn't shown a meaningless number.
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

function round2(n) {
  return Math.round(n * 100) / 100
}

export function computeSpendPace(entries, now = Date.now()) {
  const list = entries ?? []
  let thisWeek = 0
  const priorWeekTotals = [0, 0, 0, 0] // weeks 1..4 back (i.e. the 4 weeks before this one)

  for (const e of list) {
    const stake = Number(e.stake)
    if (!Number.isFinite(stake) || stake <= 0) continue
    const t = new Date(e.createdAt).getTime()
    if (!Number.isFinite(t) || t > now) continue
    const weeksAgo = Math.floor((now - t) / WEEK_MS)
    if (weeksAgo === 0) thisWeek += stake
    else if (weeksAgo >= 1 && weeksAgo <= 4) priorWeekTotals[weeksAgo - 1] += stake
  }

  const priorSum = priorWeekTotals.reduce((a, b) => a + b, 0)
  if (priorSum <= 0) return null // no baseline yet - nothing meaningful to mirror

  return { thisWeek: round2(thisWeek), typical: round2(priorSum / 4) }
}
