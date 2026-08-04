import { useEffect, useState } from 'react'
import { fetchFplEntry, fetchFplLeague } from '../api/fplClient.js'

// Fantasy Premier League rank/standings - separate from the betting side of
// the app entirely (no odds, no stake), just a second "how am I doing"
// board people running a mini-league alongside their mates' bets tend to
// want next to it. Both IDs are public (findable in any FPL page's own
// URL), so this is a straight read-only lookup, no FPL account/login
// needed. Saved to this device only (localStorage), not the Supabase
// profile - unlike bookmaker prefs, there's no cross-device sync need for
// something you'd just re-paste in seconds.
const ENTRY_KEY = 'betmates:fplEntryId'
const LEAGUE_KEY = 'betmates:fplLeagueId'

export default function FplPanel() {
  const [entryInput, setEntryInput] = useState(() => localStorage.getItem(ENTRY_KEY) ?? '')
  const [leagueInput, setLeagueInput] = useState(() => localStorage.getItem(LEAGUE_KEY) ?? '')
  const [entry, setEntry] = useState(null)
  const [league, setLeague] = useState(null)
  const [entryError, setEntryError] = useState(null)
  const [leagueError, setLeagueError] = useState(null)
  const [entryLoading, setEntryLoading] = useState(false)
  const [leagueLoading, setLeagueLoading] = useState(false)

  useEffect(() => {
    const savedEntry = localStorage.getItem(ENTRY_KEY)
    if (savedEntry) loadEntry(savedEntry)
    const savedLeague = localStorage.getItem(LEAGUE_KEY)
    if (savedLeague) loadLeague(savedLeague)
  }, [])

  async function loadEntry(id) {
    setEntryLoading(true)
    setEntryError(null)
    try {
      setEntry(await fetchFplEntry(id))
    } catch (err) {
      setEntryError(err.message)
    } finally {
      setEntryLoading(false)
    }
  }

  async function loadLeague(id) {
    setLeagueLoading(true)
    setLeagueError(null)
    try {
      setLeague(await fetchFplLeague(id))
    } catch (err) {
      setLeagueError(err.message)
    } finally {
      setLeagueLoading(false)
    }
  }

  function handleEntrySubmit(e) {
    e.preventDefault()
    const trimmed = entryInput.trim()
    if (!trimmed) return
    localStorage.setItem(ENTRY_KEY, trimmed)
    loadEntry(trimmed)
  }

  function handleLeagueSubmit(e) {
    e.preventDefault()
    const trimmed = leagueInput.trim()
    if (!trimmed) return
    localStorage.setItem(LEAGUE_KEY, trimmed)
    loadLeague(trimmed)
  }

  return (
    <div>
      <div className="account-section">
        <h2 className="market-title">My FPL team</h2>
        <p className="hint">
          Your team ID is in the FPL app/site URL - fantasy.premierleague.com/entry/<strong>123456</strong>/...
        </p>
        <form className="inline-form" onSubmit={handleEntrySubmit}>
          <input placeholder="Team ID" value={entryInput} onChange={(e) => setEntryInput(e.target.value)} inputMode="numeric" />
          <button className="btn btn-primary btn-small" type="submit" disabled={entryLoading}>
            {entryLoading ? 'Loading…' : 'Save'}
          </button>
        </form>
        {entryError && <div className="auth-error">{entryError}</div>}
        {entry && (
          <>
            <p className="race-card-meta">
              {entry.teamName} - {entry.managerName}
            </p>
            <div className="stat-tiles">
              <StatTile label="Overall rank" value={entry.overallRank ? entry.overallRank.toLocaleString() : '-'} />
              <StatTile label="Total points" value={entry.overallPoints ?? '-'} />
              <StatTile label={entry.currentEvent ? `GW${entry.currentEvent} points` : 'GW points'} value={entry.eventPoints ?? '-'} />
            </div>
          </>
        )}
      </div>

      <div className="account-section">
        <h2 className="market-title">Mini-league standings</h2>
        <p className="hint">
          Your league ID is in the FPL app/site URL - fantasy.premierleague.com/leagues/<strong>123456</strong>/standings/c
        </p>
        <form className="inline-form" onSubmit={handleLeagueSubmit}>
          <input placeholder="League ID" value={leagueInput} onChange={(e) => setLeagueInput(e.target.value)} inputMode="numeric" />
          <button className="btn btn-primary btn-small" type="submit" disabled={leagueLoading}>
            {leagueLoading ? 'Loading…' : 'Save'}
          </button>
        </form>
        {leagueError && <div className="auth-error">{leagueError}</div>}
        {league && !league.standings.length && <p className="hint">No standings yet - check back once the season's under way.</p>}
        {league && league.standings.length > 0 && (
          <div className="leaderboard-list leaderboard-list-standalone">
            {league.standings.map((row) => (
              <div key={row.entryId} className={entry && row.entryId === entry.entryId ? 'leaderboard-row leaderboard-row-top' : 'leaderboard-row'}>
                <span className="leaderboard-rank">#{row.rank}</span>
                <span className="leaderboard-name">{row.teamName}</span>
                <span className="leaderboard-meta">{row.managerName}</span>
                <span className="leaderboard-pnl">{row.totalPoints} pts</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatTile({ label, value }) {
  return (
    <div className="stat-tile">
      <div className="stat-tile-value">{value}</div>
      <div className="stat-tile-label">{label}</div>
    </div>
  )
}
