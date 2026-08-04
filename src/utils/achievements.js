import {
  computeStats,
  computeBestWeek,
  computePerfectWeek,
  computeLongestWinStreak
} from './trackerStats.js'

// Highest single-bet combined odds among wins, for the "underdog" badge -
// a multi-leg bet's combined price, not any one leg's.
function highestWinOdds(entries) {
  const wins = entries.filter((e) => e.stake && e.status === 'won')
  if (!wins.length) return 0
  return Math.max(...wins.map((e) => e.selections.reduce((acc, s) => acc * s.odds, 1)))
}

function distinctSportsCount(entries) {
  const settled = entries.filter((e) => e.stake && ['won', 'lost', 'void'].includes(e.status))
  return new Set(settled.map((e) => e.sport ?? 'football')).size
}

function highestStake(entries) {
  const staked = entries.filter((e) => e.stake).map((e) => Number(e.stake))
  return staked.length ? Math.max(...staked) : 0
}

// The full catalog, earned or not - each entry is self-contained (icon,
// label, how to unlock it, and the check itself) so the achievements page
// can render locked ones with their own hint text instead of just omitting
// them. Order is roughly easiest-to-hardest within each theme.
export function computeAchievements(entries) {
  const stats = computeStats(entries)
  const longestStreak = computeLongestWinStreak(entries)
  const bestWeek = computeBestWeek(entries)
  const perfectWeek = computePerfectWeek(entries)
  const wins = entries.filter((e) => e.stake && e.status === 'won').length
  const sportsCount = distinctSportsCount(entries)
  const topOdds = highestWinOdds(entries)
  const maxStake = highestStake(entries)

  return [
    { id: 'first-win', icon: '🎯', label: 'First win', hint: 'Win your first bet.', earned: wins >= 1 },
    { id: 'logged-10', icon: '📒', label: '10 bets logged', hint: 'Log 10 bets, win or lose.', earned: entries.length >= 10 },
    { id: 'logged-50', icon: '📒', label: '50 bets logged', hint: 'Log 50 bets.', earned: entries.length >= 50 },
    { id: 'logged-100', icon: '📒', label: '100 bets logged', hint: 'Log 100 bets.', earned: entries.length >= 100 },
    { id: 'profit-50', icon: '💰', label: '£50 lifetime profit', hint: 'Reach £50 total profit.', earned: stats.profit >= 50 },
    { id: 'profit-100', icon: '💰', label: '£100 lifetime profit', hint: 'Reach £100 total profit.', earned: stats.profit >= 100 },
    { id: 'profit-250', icon: '💰', label: '£250 lifetime profit', hint: 'Reach £250 total profit.', earned: stats.profit >= 250 },
    { id: 'profit-500', icon: '💰', label: '£500 lifetime profit', hint: 'Reach £500 total profit.', earned: stats.profit >= 500 },
    { id: 'streak-3', icon: '🔥', label: '3-win streak', hint: 'Win 3 bets in a row.', earned: longestStreak >= 3 },
    { id: 'streak-5', icon: '🔥', label: '5-win streak', hint: 'Win 5 bets in a row.', earned: longestStreak >= 5 },
    { id: 'streak-10', icon: '🔥', label: '10-win streak', hint: 'Win 10 bets in a row.', earned: longestStreak >= 10 },
    {
      id: 'perfect-week',
      icon: '💯',
      label: 'Perfect week',
      hint: 'Win every bet you settle in a week (2 bets minimum).',
      earned: !!perfectWeek
    },
    { id: 'winning-week', icon: '🏆', label: 'Winning week', hint: 'Finish any week in profit.', earned: !!bestWeek && bestWeek.profit > 0 },
    {
      id: 'multi-sport',
      icon: '🌍',
      label: 'Multi-sport bettor',
      hint: 'Settle bets across 3 different sports.',
      earned: sportsCount >= 3
    },
    { id: 'high-roller', icon: '💎', label: 'High roller', hint: 'Stake £50 or more on a single bet.', earned: maxStake >= 50 },
    {
      id: 'underdog',
      icon: '🐎',
      label: 'Underdog win',
      hint: 'Win a bet at combined odds of 5.00 or higher.',
      earned: topOdds >= 5
    }
  ]
}
