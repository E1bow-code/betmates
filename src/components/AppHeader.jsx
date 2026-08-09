import { Link } from 'react-router-dom'
import { useActivity } from '../context/ActivityContext.jsx'
import { AlertsIcon } from './icons/NavIcons.jsx'

// Persistent logo + notification-bell row, mounted once at the top of
// .app-content (see App.jsx's Shell) rather than per-page - the app had no
// shared top chrome before this (every page built its own local topbar),
// and the bell is now the only way to reach /alerts since BottomNav's
// restructure dropped it as a dedicated tab. Desktop hides the wordmark
// (the sidebar already shows it) and keeps just the bell - see the
// >=880px rules in style.css.
export default function AppHeader() {
  const { hasUnseenNotifications } = useActivity()

  return (
    <div className="app-header">
      <Link to="/dashboard" className="app-header-brand">
        BetMates
      </Link>
      <Link to="/alerts" className="app-header-bell" aria-label={`Alerts${hasUnseenNotifications ? ' - unread' : ''}`}>
        <AlertsIcon />
        {hasUnseenNotifications && <span className="bottom-nav-dot" />}
      </Link>
    </div>
  )
}
