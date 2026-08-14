import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useActivity } from '../context/ActivityContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useOddsFormat } from '../context/OddsFormatContext.jsx'
import * as dataStore from '../lib/dataStore.js'
import { formatRelativeTime } from '../utils/format.js'
import { formatOdds } from '../utils/oddsFormat.js'
import EmptyState from '../components/EmptyState.jsx'
import SportHeroBanner from '../components/SportHeroBanner.jsx'
import UserLink from '../components/UserLink.jsx'
import { REACTION_EMOJIS, VOTE_OPTIONS } from '../components/BetCard.jsx'
import { BellIcon, CommentIcon, CheckIcon, XIcon, MinusIcon } from '../components/icons/Icons.jsx'

const SETTLED_ICON = { won: CheckIcon, lost: XIcon, void: MinusIcon }

// Same reacted/voted split BetCard.jsx's own toggleReaction push-notification
// title uses - kept in one place (REACTION_EMOJIS/VOTE_OPTIONS are exported
// from there) so the two can't silently drift on what counts as a vote.
function reactionVerb(emoji) {
  if (REACTION_EMOJIS.includes(emoji)) return `reacted ${emoji} to`
  const label = VOTE_OPTIONS.find((o) => o.key === emoji)?.label ?? emoji
  return `voted "${label}" on`
}

// A real tab rather than a floating bell dropdown - matches how the rest of
// the app navigates (Odds/Social/Tracker/Account are all pages, not
// popovers), and skips having to solve dropdown positioning on both the
// mobile bottom-nav and the desktop sidebar. See ActivityContext.jsx for
// where this feed is actually built - composed from data other pages
// already fetch, not a dedicated notifications table.
export default function NotificationsPage() {
  const { user } = useAuth()
  const { format } = useOddsFormat()
  const { notifications, markNotificationsSeen } = useActivity()
  const [priceAlerts, setPriceAlerts] = useState(null)
  const [removingId, setRemovingId] = useState(null)

  useEffect(() => {
    markNotificationsSeen()
  }, [markNotificationsSeen])

  useEffect(() => {
    dataStore.listMyOddsAlerts(user.id).then(setPriceAlerts)
  }, [user.id])

  async function handleRemoveAlert(alertId) {
    setRemovingId(alertId)
    try {
      await dataStore.deleteOddsAlert(alertId)
      setPriceAlerts((alerts) => alerts.filter((a) => a.id !== alertId))
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <div>
      <SportHeroBanner sport="alerts" />
      <div className="topbar">
        <h1>Alerts</h1>
      </div>

      {notifications === null && <div className="loading">Catching up…</div>}

      {notifications && !notifications.length && (
        <EmptyState
          icon={<BellIcon width={26} height={26} />}
          title="Nothing new"
          subtitle="Bets posted in your groups or the public feed, and results on your own bets, show up here."
        />
      )}

      {notifications && notifications.length > 0 && (
        <div className="tracker-list">
          {notifications.map((n) => (
            <NotificationRow key={n.id} item={n} />
          ))}
        </div>
      )}

      {priceAlerts && priceAlerts.length > 0 && (
        <div className="account-section">
          <h2 className="market-title">My price alerts</h2>
          <p className="hint">
            Set from the <BellIcon width={13} height={13} className="icon-lead" /> button on any outcome's price. Checked every 15
            minutes while pending.
          </p>
          <div className="tracker-list">
            {priceAlerts.map((a) => (
              <div key={a.id} className={a.triggeredAt ? 'tracker-row icon-row status-triggered' : 'tracker-row icon-row'}>
                <span className="icon-row-badge">
                  <BellIcon width={18} height={18} />
                </span>
                <div className="tracker-row-main">
                  <div className="selection-event">
                    {a.eventLabel} · {a.marketLabel}: {a.selectionLabel}
                  </div>
                  <div className="race-card-meta">
                    {a.triggeredAt
                      ? `Hit ${formatOdds(a.targetDecimal, format)} · ${formatRelativeTime(a.triggeredAt)}`
                      : `Waiting for ${formatOdds(a.targetDecimal, format)} or better`}
                  </div>
                </div>
                <button className="btn btn-ghost btn-small" onClick={() => handleRemoveAlert(a.id)} disabled={removingId === a.id}>
                  {removingId === a.id ? 'Removing…' : 'Remove'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Was three plain <Link>s wrapping the same row content - fine until the
// author name inside needed its own link to their profile, since a nested
// <a> inside an <a> is invalid HTML and misbehaves. The row itself is now a
// div driving navigation via useNavigate (role="link" + Enter/Space keep it
// keyboard-accessible the way a real <a> was for free), and the inner
// UserLink stops the click from bubbling up to the row's own navigation.
function NotificationRow({ item }) {
  const navigate = useNavigate()
  const rowClass =
    item.kind === 'settled'
      ? `tracker-row icon-row notification-row status-${item.status}`
      : 'tracker-row icon-row notification-row'

  const isSocial = item.kind === 'posted' || item.kind === 'commented' || item.kind === 'reacted'

  function goToRowTarget() {
    if (isSocial && item.groupId) navigate(`/groups/${item.groupId}`)
    else if (isSocial) navigate('/groups', { state: { segment: 'feed' } })
    else navigate('/tracker')
  }

  return (
    <div
      className={rowClass}
      role="link"
      tabIndex={0}
      onClick={goToRowTarget}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          goToRowTarget()
        }
      }}
    >
      <span className="icon-row-badge">
        {item.kind === 'reacted' ? (
          REACTION_EMOJIS.includes(item.emoji) ? item.emoji : '🎯'
        ) : (
          (() => {
            const Icon = item.kind === 'posted' || item.kind === 'commented' ? CommentIcon : SETTLED_ICON[item.status]
            return Icon && <Icon width={18} height={18} />
          })()
        )}
      </span>
      <div className="tracker-row-main">
        <div className="selection-event">
          {item.kind === 'posted' ? (
            <>
              <strong onClick={(e) => e.stopPropagation()}>
                <UserLink id={item.userId} displayName={item.name} />
              </strong>{' '}
              posted a bet on {item.event}
            </>
          ) : item.kind === 'commented' ? (
            <>
              <strong onClick={(e) => e.stopPropagation()}>
                <UserLink id={item.userId} displayName={item.name} />
              </strong>{' '}
              commented on your bet on {item.event}: "{item.body}"
            </>
          ) : item.kind === 'reacted' ? (
            <>
              <strong onClick={(e) => e.stopPropagation()}>
                <UserLink id={item.userId} displayName={item.name} />
              </strong>{' '}
              {reactionVerb(item.emoji)} your bet on {item.event}
            </>
          ) : (
            <>
              Your bet on {item.event} was marked <strong>{item.status === 'won' ? 'won' : item.status === 'lost' ? 'lost' : 'void'}</strong>
            </>
          )}
        </div>
        <div className="race-card-meta">{formatRelativeTime(item.at)}</div>
      </div>
      {item.kind === 'settled' && (
        <span className={`chip chip--pill chip--sm chip--outline bet-status-pill status-${item.status}`}>{item.status === 'won' ? 'Won' : item.status === 'lost' ? 'Lost' : 'Void'}</span>
      )}
    </div>
  )
}
