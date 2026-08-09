import { Link, NavLink } from 'react-router-dom'
import { useActivity } from '../context/ActivityContext.jsx'
import { HomeIcon, SocialIcon, OddsIcon, AccountIcon, PlusIcon } from './icons/NavIcons.jsx'

// Home / Mates / + / Discover / You - Tracker and Alerts no longer get a
// dedicated slot: Tracker is one tap from You (see AccountPage.jsx's P&L
// teaser) and Alerts moved to the notification bell in AppHeader.jsx.
const LEFT_TABS = [
  { to: '/dashboard', label: 'Home', Icon: HomeIcon },
  { to: '/groups', label: 'Mates', Icon: SocialIcon }
]
const RIGHT_TABS = [
  { to: '/odds', label: 'Discover', Icon: OddsIcon },
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
