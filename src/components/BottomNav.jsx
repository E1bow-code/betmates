import { Link, NavLink } from 'react-router-dom'
import { useActivity } from '../context/ActivityContext.jsx'
import { HomeIcon, OddsIcon, SocialIcon, TrackerIcon, AlertsIcon, AccountIcon } from './icons/NavIcons.jsx'

const TABS = [
  { to: '/dashboard', label: 'Home', Icon: HomeIcon },
  { to: '/odds', label: 'Odds', Icon: OddsIcon },
  { to: '/groups', label: 'Social', Icon: SocialIcon },
  { to: '/tracker', label: 'Tracker', Icon: TrackerIcon },
  { to: '/alerts', label: 'Alerts', Icon: AlertsIcon },
  { to: '/account', label: 'Account', Icon: AccountIcon }
]

export default function BottomNav() {
  const { hasNewActivity, hasUnseenNotifications, hasUnseenMessages, streak } = useActivity()
  // Only a live win streak gets the badge - a loss streak nagging you from
  // the nav bar every time you open the app is a bad feeling to build in on
  // purpose, even though the same run shows up honestly on Tracker either way.
  const showStreak = streak.type === 'won' && streak.count >= 2

  return (
    <nav className="bottom-nav">
      <Link to="/dashboard" className="sidebar-brand">
        BetMates
      </Link>
      {TABS.map((tab) => (
        <NavLink key={tab.to} to={tab.to} className={({ isActive }) => (isActive ? 'bottom-nav-item active' : 'bottom-nav-item')}>
          <span className="bottom-nav-icon">
            <tab.Icon />
            {tab.to === '/groups' && (hasNewActivity || hasUnseenMessages) && <span className="bottom-nav-dot" />}
            {tab.to === '/alerts' && hasUnseenNotifications && <span className="bottom-nav-dot" />}
          </span>
          <span className="bottom-nav-label">
            {tab.label}
            {tab.to === '/groups' && showStreak && <span className="bottom-nav-streak">🔥{streak.count}</span>}
          </span>
        </NavLink>
      ))}
    </nav>
  )
}
