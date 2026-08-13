import { useEffect, useState } from 'react'
import * as dataStore from '../lib/dataStore.js'
import { notifyGroup } from '../lib/notify.js'
import { computeTournamentStandings } from '../utils/groupTournament.js'
import { useAsyncAction } from '../lib/useAsyncAction.js'
import Avatar from './Avatar.jsx'
import { TrophyIcon } from './icons/Icons.jsx'

const DURATIONS = [
  { days: 7, label: '1w' },
  { days: 14, label: '2w' },
  { days: 30, label: '1m' }
]
const METRICS = [
  { key: 'profit', label: 'Profit' },
  { key: 'roi', label: 'ROI' }
]
const METRIC_LABEL = Object.fromEntries(METRICS.map((m) => [m.key, m.label]))

function daysLeft(endsAt) {
  const ms = new Date(endsAt).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)))
}

// A seasonal mini-league scoped to this group - same collapsible
// .leaderboard shell as Leaderboard.jsx/PickemLeaderboard.jsx above it on
// GroupFeedPage's Feed tab, since it's a third scoreboard living in the
// same spot, not a standalone feature. Standings recompute live from the
// tournament's own stored [startsAt, endsAt] window (see
// src/utils/groupTournament.js's comment) rather than needing a cron -
// same shape as ChallengeSection.jsx's 1v1 challenges, just ranking every
// group member instead of two people.
export default function GroupTournamentSection({ groupId, groupName, posts, memberNames, currentUserId, isCreator }) {
  const [expanded, setExpanded] = useState(false)
  const [tournaments, setTournaments] = useState(null)
  const [name, setName] = useState('')
  const [metric, setMetric] = useState('profit')
  const [days, setDays] = useState(14)
  const [starting, setStarting] = useState(false)
  const runAsync = useAsyncAction()

  function refresh() {
    return dataStore.listGroupTournaments(groupId).then(setTournaments)
  }

  useEffect(() => {
    if (!expanded || tournaments) return
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded])

  async function handleStart(e) {
    e.preventDefault()
    if (!name.trim()) return
    setStarting(true)
    await runAsync(async () => {
      await dataStore.createGroupTournament({ groupId, name: name.trim(), metric, days, createdBy: currentUserId })
      notifyGroup(
        groupId,
        {
          title: `🏆 ${name.trim()}`,
          body: `A new tournament just started in ${groupName} - ${METRIC_LABEL[metric]} over ${days} days`,
          url: `/#/groups/${groupId}`
        },
        currentUserId
      )
      setName('')
      await refresh()
    }, "Couldn't start that tournament")
    setStarting(false)
  }

  const now = Date.now()
  const active = tournaments?.find((t) => new Date(t.endsAt).getTime() > now)
  const past = tournaments?.filter((t) => new Date(t.endsAt).getTime() <= now) ?? []

  return (
    <div className="leaderboard">
      <button className="leaderboard-toggle icon-row" onClick={() => setExpanded((v) => !v)}>
        <TrophyIcon width={16} height={16} /> Tournaments {expanded ? '▲' : '▼'}
      </button>
      {expanded && (
        <>
          {!tournaments && <div className="loading">Loading tournaments…</div>}

          {tournaments && active && <ActiveTournament tournament={active} posts={posts} memberNames={memberNames} />}

          {tournaments && !active && isCreator && (
            <form className="challenge-start" onSubmit={handleStart}>
              <label className="field">
                <input placeholder="Tournament name, e.g. Summer Cup" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
              </label>
              <div className="mode-switcher">
                {METRICS.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    className={metric === m.key ? 'mode-tab active' : 'mode-tab'}
                    onClick={() => setMetric(m.key)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <div className="mode-switcher">
                {DURATIONS.map((d) => (
                  <button
                    key={d.days}
                    type="button"
                    className={days === d.days ? 'mode-tab active' : 'mode-tab'}
                    onClick={() => setDays(d.days)}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              <button className="btn btn-primary btn-small" type="submit" disabled={starting || !name.trim()}>
                {starting ? 'Starting…' : 'Start tournament'}
              </button>
            </form>
          )}

          {tournaments && !active && !isCreator && past.length === 0 && (
            <p className="hint">No tournament running yet - only the group creator can start one.</p>
          )}

          {past.length > 0 && (
            <div className="challenge-history">
              {past.slice(0, 3).map((t) => {
                const standings = computeTournamentStandings(posts, memberNames, t.startsAt, t.endsAt, t.metric)
                const champion = standings[0]
                return (
                  <div key={t.id} className="challenge-history-row">
                    <span className="challenge-history-label">
                      {t.name} · {METRIC_LABEL[t.metric]}
                    </span>
                    <span className="challenge-history-score icon-row">
                      {champion ? (
                        <>
                          <TrophyIcon width={13} height={13} /> {champion.name}
                        </>
                      ) : (
                        'No result'
                      )}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ActiveTournament({ tournament, posts, memberNames }) {
  const standings = computeTournamentStandings(posts, memberNames, tournament.startsAt, tournament.endsAt, tournament.metric)
  const left = daysLeft(tournament.endsAt)
  return (
    <>
      <p className="hint">
        {tournament.name} · {METRIC_LABEL[tournament.metric]} · {left === 0 ? 'ends today' : `${left} day${left === 1 ? '' : 's'} left`}
      </p>
      {!standings.length && <p className="hint">Nothing settled yet.</p>}
      {standings.length > 0 && (
        <div className="leaderboard-list">
          {standings.map((row) => {
            const value = tournament.metric === 'roi' ? row.roi : row.profit
            return (
              <div key={row.userId} className={row.rank === 1 ? 'leaderboard-row leaderboard-row-top' : 'leaderboard-row'}>
                <span className="leaderboard-rank">#{row.rank}</span>
                <Avatar name={row.name} size={24} />
                <span className="leaderboard-name">{row.name}</span>
                <span className={`leaderboard-pnl ${value === null || value >= 0 ? 'tone-good' : 'tone-bad'}`}>
                  {tournament.metric === 'roi'
                    ? value === null
                      ? '—'
                      : `${value >= 0 ? '+' : ''}${value}%`
                    : `${value >= 0 ? '+' : ''}£${value.toFixed(2)}`}
                </span>
                <span className="leaderboard-meta">{row.winRate === null ? '-' : `${row.winRate}% WR`}</span>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
