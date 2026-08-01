export function computeStats(entries) {
  const settled = entries.filter((e) => e.stake && ['won', 'lost', 'void'].includes(e.status))
  const staked = settled.reduce((sum, e) => sum + Number(e.stake), 0)
  const profit = settled.reduce((sum, e) => {
    if (e.status === 'won') return sum + (Number(e.potentialReturn) - Number(e.stake))
    if (e.status === 'lost') return sum - Number(e.stake)
    return sum
  }, 0)
  const decided = settled.filter((e) => e.status === 'won' || e.status === 'lost')
  const won = decided.filter((e) => e.status === 'won').length
  const winRate = decided.length ? Math.round((won / decided.length) * 100) : null
  const roi = staked ? Math.round((profit / staked) * 1000) / 10 : null
  return { staked, profit, winRate, roi, settledCount: settled.length, openCount: entries.length - settled.length }
}
