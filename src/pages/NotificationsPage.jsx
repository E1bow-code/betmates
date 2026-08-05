import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useActivity } from '../context/ActivityContext.jsx'
import { formatRelativeTime } from '../utils/format.js'
import EmptyState from '../components/EmptyState.jsx'
import SportHeroBanner from '../components/SportHeroBanner.jsx'

// A real tab rather than a floating bell dropdown - matches how the rest of
// the app navigates (Odds/Social/Tracker/Account are all pages, not
// popovers), and skips having to solve dropdown positioning on both the
// mobile bottom-nav and the desktop sidebar. See ActivityContext.jsx for
// where this feed is actually built - composed from data other pages
// already fetch, not a dedicated notifications table.
export default function NotificationsPage() {
  const { notifications, markNotificationsSeen } = useActivity()

  useEffect(() => {
    markNotificationsSeen()
  }, [markNotificationsSeen])

  return (
    <div>
      <SportHeroBanner sport="alerts" />
      <div className="topbar">
        <h1>Alerts</h1>
      </div>

      {notifications === null && <div className="loading">Catching up…</div>}

      {notifications && !notifications.length && (
        <EmptyState
          icon="🔔"
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
    </div>
  )
}

function NotificationRow({ item }) {
  const content = (
    <>
      <div className="tracker-row-main">
        <div className="selection-event">
          {item.kind === 'posted' ? (
            <>
              <strong>{item.name}</strong> posted a bet on {item.event}
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
        <span className={`bet-status-pill status-${item.status}`}>{item.status === 'won' ? 'Won' : item.status === 'lost' ? 'Lost' : 'Void'}</span>
      )}
    </>
  )

  if (item.kind === 'posted' && item.groupId) {
    return (
      <Link to={`/groups/${item.groupId}`} className="tracker-row notification-row">
        {content}
      </Link>
    )
  }
  if (item.kind === 'posted') {
    return (
      <Link to="/groups" state={{ segment: 'feed' }} className="tracker-row notification-row">
        {content}
      </Link>
    )
  }
  return (
    <Link to="/tracker" className="tracker-row notification-row">
      {content}
    </Link>
  )
}
