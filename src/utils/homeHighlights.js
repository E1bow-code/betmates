import { computeDisciplineStreak } from './discipline.js'
import { computeBettingStyle } from './insights.js'
import { moneyLeftOnTable } from './lineValue.js'
import { findBadBeats } from './badBeats.js'

// HomePage's "something to say" grab-bag - same silent-omission pattern as
// TrackerPage's Hall of Fame badges array: each candidate stat below either
// has something interesting to report (a truthy row) or it doesn't (false/
// undefined), and only the ones that do survive `.filter(Boolean)`. Capped
// at 3 so the strip never grows into a second Insights page; when more than
// 3 qualify, earlier entries in this array win - discipline streak first
// since it's the one stat here that doesn't render anywhere else in the app
// today (the other three already have a home on Insights, this is just a
// teaser for them), the bad beat dropped first since it's downbeat and the
// other three already cover "something to show".
export function computeHomeHighlights(entries) {
  const hasLoss = entries.some((e) => e.status === 'lost')
  const disciplineStreak = computeDisciplineStreak(entries)
  const bettingStyle = computeBettingStyle(entries)
  const leftOnTable = moneyLeftOnTable(entries)
  const worstBeat = findBadBeats(entries, 1)[0]

  return [
    hasLoss &&
      disciplineStreak >= 3 && {
        key: 'discipline',
        icon: '🧊',
        title: 'Staying disciplined',
        value: `${disciplineStreak} bets without chasing a loss`,
        to: '/tracker'
      },
    bettingStyle && {
      key: 'volatility',
      icon: '🎢',
      title: 'Your betting style',
      value: `${bettingStyle.style} · £${bettingStyle.stdev.toFixed(2)} swing per bet`,
      to: '/insights'
    },
    leftOnTable &&
      leftOnTable.total > 0 && {
        key: 'moneyLeftOnTable',
        icon: '🪙',
        title: 'Money left on the table',
        value: `£${leftOnTable.total.toFixed(2)} across ${leftOnTable.sample} bet${leftOnTable.sample === 1 ? '' : 's'}`,
        to: '/insights'
      },
    worstBeat && {
      key: 'badBeat',
      icon: '💔',
      title: 'The one that got away',
      value: `${worstBeat.legCount - 1} of ${worstBeat.legCount} legs came in - missed ${worstBeat.missedLeg.selection}`,
      to: '/insights'
    }
  ]
    .filter(Boolean)
    .slice(0, 3)
}
