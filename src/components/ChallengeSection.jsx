import { useEffect, useState } from 'react'
import * as dataStore from '../lib/dataStore.js'
import { notifyFriend } from '../lib/notify.js'
import { computeChallengeStats, pickChallengeWinner, formatChallengeValue } from '../utils/challenge.js'
import { shareChallengeImage } from '../lib/shareImage.js'
import { useAsyncAction } from '../lib/useAsyncAction.js'

const DURATIONS = [
  { days: 3, label: '3d' },
  { days: 7, label: '7d' },
  { days: 14, label: '14d' }
]
const METRICS = [
  { key: 'profit', label: 'Profit' },
  { key: 'roi', label: 'ROI' },
  { key: 'pickem', label: "Pick'em" }
]
const METRIC_LABEL = Object.fromEntries(METRICS.map((m) => [m.key, m.label]))

function daysLeft(endsAt) {
  const ms = new Date(endsAt).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)))
}

// Turns HeadToHeadSheet.jsx's always-on, all-time comparison into a real,
// time-boxed contest. myPosts/theirPosts are the exact same visibility-
// filtered raw posts that sheet already fetches (shared groups + public
// feed, stake-hidden bets already excluded) - just not yet reduced to
// all-time stats, so a challenge's own [startsAt, endsAt) window can be
// applied fresh here instead of refetching anything.
export default function ChallengeSection({ user, friend, myPosts, theirPosts }) {
  const [challenges, setChallenges] = useState(null)
  const [days, setDays] = useState(7)
  const [metric, setMetric] = useState('profit')
  const [starting, setStarting] = useState(false)
  const [shareStatus, setShareStatus] = useState({})
  const runAsync = useAsyncAction()

  function refresh() {
    return dataStore.listChallengesBetween(user.id, friend.id).then(setChallenges)
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, friend.id])

  if (!challenges) return <div className="loading">Loading challenges…</div>

  const now = Date.now()
  const active = challenges.find((c) => new Date(c.endsAt).getTime() > now)
  const past = challenges.filter((c) => new Date(c.endsAt).getTime() <= now)

  function statsFor(challenge) {
    const mine = computeChallengeStats(myPosts, challenge.startsAt, challenge.endsAt, challenge.metric)
    const theirs = computeChallengeStats(theirPosts, challenge.startsAt, challenge.endsAt, challenge.metric)
    // 'a' = mine, 'b' = theirs - see pickChallengeWinner's own comment on
    // why it's direction-agnostic rather than challenger/opponent-based.
    const winner = pickChallengeWinner(mine, theirs, challenge.metric)
    return { mine, theirs, winner }
  }

  async function handleStart(e) {
    e.preventDefault()
    setStarting(true)
    await runAsync(async () => {
      await dataStore.createChallenge({ challengerId: user.id, opponentId: friend.id, metric, days })
      notifyFriend(friend.id, {
        title: '⚔️ New challenge',
        body: `${user.displayName ?? 'A mate'} challenged you - ${METRIC_LABEL[metric]} over ${days} days`,
        url: '/#/groups'
      })
      await refresh()
    }, "Couldn't start that challenge")
    setStarting(false)
  }

  async function handleShare(challenge) {
    const { mine, theirs, winner } = statsFor(challenge)
    setShareStatus((s) => ({ ...s, [challenge.id]: 'working' }))
    try {
      const result = await shareChallengeImage({
        metric: challenge.metric,
        days,
        nameA: 'You',
        valueA: formatChallengeValue(mine, challenge.metric),
        nameB: friend.displayName,
        valueB: formatChallengeValue(theirs, challenge.metric),
        winner
      })
      setShareStatus((s) => ({ ...s, [challenge.id]: result === 'downloaded' ? 'downloaded' : 'shared' }))
    } catch {
      setShareStatus((s) => ({ ...s, [challenge.id]: 'idle' }))
    } finally {
      setTimeout(() => setShareStatus((s) => ({ ...s, [challenge.id]: 'idle' })), 2000)
    }
  }

  return (
    <div className="challenge-section">
      <p className="h2h-name">⚔️ Challenges</p>

      {active && <ActiveChallenge challenge={active} stats={statsFor(active)} friendName={friend.displayName} />}

      {!active && (
        <form className="challenge-start" onSubmit={handleStart}>
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
          <button className="btn btn-primary btn-small" type="submit" disabled={starting}>
            {starting ? 'Starting…' : `Challenge ${friend.displayName}`}
          </button>
        </form>
      )}

      {past.length > 0 && (
        <div className="challenge-history">
          {past.slice(0, 3).map((c) => {
            const { mine, theirs, winner } = statsFor(c)
            const resultLabel =
              winner === 'a' ? 'You won' : winner === 'b' ? `${friend.displayName} won` : winner === 'tie' ? 'Tied' : 'No result'
            return (
              <div key={c.id} className="challenge-history-row">
                <span className="challenge-history-label">
                  {METRIC_LABEL[c.metric]} · {resultLabel}
                </span>
                <span className="challenge-history-score">
                  {formatChallengeValue(mine, c.metric)} – {formatChallengeValue(theirs, c.metric)}
                </span>
                <button className="btn btn-ghost btn-small" onClick={() => handleShare(c)} disabled={shareStatus[c.id] === 'working'}>
                  {shareStatus[c.id] === 'working'
                    ? 'Rendering…'
                    : shareStatus[c.id] === 'downloaded'
                      ? 'Saved!'
                      : shareStatus[c.id] === 'shared'
                        ? 'Shared!'
                        : 'Share'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ActiveChallenge({ challenge, stats, friendName }) {
  const left = daysLeft(challenge.endsAt)
  return (
    <div className="challenge-active">
      <div className="challenge-active-row">
        <span>You</span>
        <span className={stats.winner === 'a' ? 'challenge-value tone-good' : 'challenge-value'}>
          {formatChallengeValue(stats.mine, challenge.metric)}
        </span>
      </div>
      <div className="challenge-active-row">
        <span>{friendName}</span>
        <span className={stats.winner === 'b' ? 'challenge-value tone-good' : 'challenge-value'}>
          {formatChallengeValue(stats.theirs, challenge.metric)}
        </span>
      </div>
      <p className="hint">
        {METRIC_LABEL[challenge.metric]} challenge · {left === 0 ? 'ends today' : `${left} day${left === 1 ? '' : 's'} left`}
      </p>
    </div>
  )
}
