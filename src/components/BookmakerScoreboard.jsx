import { MIN_SETTLED_TO_RANK } from '../utils/bookmakerScoreboard.js'
import EmptyState from './EmptyState.jsx'

// Reuses Leaderboard.jsx's row markup (rank/name/pnl/meta, no Avatar since
// a bookmaker isn't a person) so this reads as the same kind of scoreboard
// as everything else on the tab, just ranking bookmakers instead of people.
export default function BookmakerScoreboard({ rows }) {
  return (
    <>
      <p className="hint">
        Which bookmakers have actually paid out across every bet you can see - your groups' and the public feed's.
        Ranked by ROI on single-leg bets (min {MIN_SETTLED_TO_RANK} settled) - accumulators don't count since there's
        no single bookmaker to credit or blame for a combined price.
      </p>

      {rows === null && <div className="loading">Adding it all up…</div>}
      {rows && !rows.length && (
        <EmptyState
          icon="🏦"
          title="No bookmakers ranked yet"
          subtitle={`Settle at least ${MIN_SETTLED_TO_RANK} single-leg bets with the same bookmaker to make the board.`}
        />
      )}

      {rows && rows.length > 0 && (
        <div className="leaderboard-list leaderboard-list-standalone">
          {rows.map((row, i) => (
            <div key={row.bookmaker} className={i === 0 ? 'leaderboard-row leaderboard-row-top' : 'leaderboard-row'}>
              <span className="leaderboard-rank">#{i + 1}</span>
              <span className="leaderboard-name">{row.bookmaker}</span>
              <span className={`leaderboard-pnl ${row.roi >= 0 ? 'tone-good' : 'tone-bad'}`}>
                {row.roi >= 0 ? '+' : ''}
                {row.roi}% ROI
              </span>
              <span className="leaderboard-meta">
                {row.winRate === null ? '-' : `${row.winRate}% WR`} · {row.settledCount} settled
                {row.beatLineRate !== null && ` · beat the line ${row.beatLineRate}%`}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
