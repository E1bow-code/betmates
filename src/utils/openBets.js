// The signed-in user's currently-open positions, summarised for CoachGPT's
// get_my_open_bets tool - so it can factor in what they're already on: avoid
// recommending a duplicate of a bet they've got running, flag when they're
// heavily exposed to one event, or just reference their live slips. Also a
// quiet responsible-play win (awareness of live exposure).
//
// Pure: the netlify function fetches the open bets (the same open bet_posts +
// manual_entries the Tracker settles) and hands the raw rows in. Reads the
// snake_case `potential_return` those rows carry (falling back to camelCase so
// it also works if fed the app's own entry shape); selection legs are stored
// as the app's camelCase objects inside the jsonb, so leg.event/selection/odds
// read directly.
function round2(n) {
  return Math.round(n * 100) / 100
}

export function summariseOpenBets(rows) {
  const open = (Array.isArray(rows) ? rows : []).filter((e) => e && e.status === 'open')
  if (!open.length) return { available: false, reason: 'no open bets right now' }

  let totalStaked = 0
  const positions = open.map((e) => {
    const stake = Number(e.stake)
    const staked = Number.isFinite(stake) && stake > 0 ? stake : null
    if (staked) totalStaked += staked
    const legs = Array.isArray(e.selections) ? e.selections : []
    const prRaw = e.potential_return != null ? e.potential_return : e.potentialReturn
    const pr = Number(prRaw)
    return {
      legs: legs.length,
      picks: legs.map((l) => l && l.selection).filter(Boolean),
      events: [...new Set(legs.map((l) => l && l.event).filter(Boolean))],
      stake: staked,
      potentialReturn: Number.isFinite(pr) ? round2(pr) : null
    }
  })

  return {
    available: true,
    openCount: open.length,
    totalStaked: round2(totalStaked),
    positions
  }
}
