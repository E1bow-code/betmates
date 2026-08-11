import { Link, NavLink } from 'react-router-dom'
import { useActivity } from '../context/ActivityContext.jsx'
import { HomeIcon, SocialIcon, TrackerIcon, AccountIcon, PlusIcon } from './icons/NavIcons.jsx'

// Home / Mates / + / Tracker / You - Alerts moved to the notification bell
// in AppHeader.jsx. Tracker used to have no nav slot at all (only a teaser
// link buried in Account) despite being the app's core "how am I doing"
// view, so it takes the slot Discover previously held; Discover moved to
// MoreMenu.jsx as a top-level item instead, one tap away either way.
const LEFT_TABS = [
  { to: '/dashboard', label: 'Home', Icon: HomeIcon },
  { to: '/groups', label: 'Mates', Icon: SocialIcon }
]
const RIGHT_TABS = [
  { to: '/tracker', label: 'Tracker', Icon: TrackerIcon },
  { to: '/account', label: 'You', Icon: AccountIcon }
]

function renderTab(tab, hasNewActivity, hasUnseenMessages, showStreak, streak) {
  return (
    <NavLink key={tab.to} to={tab.to} className={({ isActive }) => (isActive ? 'bottom-nav-item active' : 'bottom-nav-item')}>
      <span className="bottom-nav-icon">
        <tab.Icon />
        {tab.to === '/groups' && (hasNewActivity || hasUnseenMessages) && <span className="bottom-nav-dot" />}
      </span>
      <span className="bottom-nav-label">
        {tab.label}
        {tab.to === '/groups' && showStreak && <span className="bottom-nav-streak">🔥{streak.count}</span>}
      </span>
    </NavLink>
  )
}

export default function BottomNav({ onAddClick }) {
  const { hasNewActivity, hasUnseenMessages, streak } = useActivity()
  // Only a live win streak gets the badge - a loss streak nagging you from
  // the nav bar every time you open the app is a bad feeling to build in on
  // purpose, even though the same run shows up honestly on Tracker either way.
  const showStreak = streak.type === 'won' && streak.count >= 2

  return (
    <nav className="bottom-nav">
      <Link to="/dashboard" className="sidebar-brand">
        BetMates
      </Link>
      {LEFT_TABS.map((tab) => renderTab(tab, hasNewActivity, hasUnseenMessages, showStreak, streak))}
      <button type="button" className="bottom-nav-fab" onClick={onAddClick} aria-label="Log a bet">
        <PlusIcon />
      </button>
      {RIGHT_TABS.map((tab) => renderTab(tab, hasNewActivity, hasUnseenMessages, showStreak, streak))}
    </nav>
  )
}
