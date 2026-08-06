import { computeGroupRecap } from '../utils/groupRecap.js'
import ShareRecapButton from './ShareRecapButton.jsx'

// "This week" summary at the top of a group feed: how the group did over the
// last seven days, who's the week's top tipster, and the biggest win. Renders
// nothing until there's at least one settled bet this week. The same numbers
// can be shared as an image via the existing recap-image button.
export default function GroupRecapCard({ posts, memberNames }) {
  const recap = computeGroupRecap(posts, memberNames)
  if (!recap) return null

  const pnlSign = recap.groupProfit >= 0 ? '+' : ''
  const shareRows = [
    { label: 'Bets settled', value: String(recap.settledCount) },
    { label: 'Group P&L', value: `${pnlSign}£${recap.groupProfit.toFixed(2)}`, tone: recap.groupProfit >= 0 ? 'good' : 'bad' },
    recap.topTipster && {
      label: 'Top tipster',
      value: `${recap.topTipster.name} (${recap.topTipster.profit >= 0 ? '+' : ''}£${recap.topTipster.profit.toFixed(2)})`
    },
    recap.biggestWin && { label: 'Biggest win', value: `${recap.biggestWin.name} +£${recap.biggestWin.profit.toFixed(2)}` }
  ].filter(Boolean)

  return (
    <div className="group-recap-card">
      <div className="group-recap-head">
        <h2 className="market-title">This week</h2>
        <ShareRecapButton rows={shareRows} periodLabel="this week" />
      </div>

      <div className="stat-tiles group-recap-tiles">
        <div className={`stat-tile ${recap.groupProfit >= 0 ? 'tone-good' : 'tone-bad'}`}>
          <div className="stat-tile-value">
            {pnlSign}£{recap.groupProfit.toFixed(2)}
          </div>
          <div className="stat-tile-label">Group P&amp;L</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-value">{recap.settledCount}</div>
          <div className="stat-tile-label">Bets settled</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-value">{recap.activeCount}</div>
          <div className="stat-tile-label">{recap.activeCount === 1 ? 'Mate betting' : 'Mates betting'}</div>
        </div>
      </div>

      <div className="group-recap-highlights">
        {recap.topTipster && (
          <div className="group-recap-line">
            <span className="group-recap-line-icon">🏅</span>
            <span>
              <strong>{recap.topTipster.name}</strong> is top tipster —{' '}
              <span className={recap.topTipster.profit >= 0 ? 'tone-good' : 'tone-bad'}>
                {recap.topTipster.profit >= 0 ? '+' : ''}£{recap.topTipster.profit.toFixed(2)}
              </span>{' '}
              over {recap.topTipster.settledCount} {recap.topTipster.settledCount === 1 ? 'bet' : 'bets'}
              {recap.topTipster.winRate === null ? '' : ` · ${recap.topTipster.winRate}% win rate`}
            </span>
          </div>
        )}
        {recap.biggestWin && (
          <div className="group-recap-line">
            <span className="group-recap-line-icon">💰</span>
            <span>
              Biggest win: <strong>{recap.biggestWin.name}</strong> +£{recap.biggestWin.profit.toFixed(2)}
              {recap.biggestWin.event ? ` on ${recap.biggestWin.legs > 1 ? `a ${recap.biggestWin.legs}-leg bet` : recap.biggestWin.event}` : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
