import { NavLink } from 'react-router-dom'
import { useActivity } from '../context/ActivityContext.jsx'
import { OddsIcon, SocialIcon, TrackerIcon, AlertsIcon, AccountIcon } from './icons/NavIcons.jsx'

const TABS = [
  { to: '/odds', label: 'Odds', Icon: OddsIcon },
  { to: '/groups', label: 'Social', Icon: SocialIcon },
  { to: '/tracker', label: 'Tracker', Icon: TrackerIcon },
  { to: '/alerts', label: 'Alerts', Icon: AlertsIcon },
  { to: '/account', label: 'Account', Icon: AccountIcon }
]

export default function BottomNav() {
  const { hasNewActivity, hasUnseenNotifications } = useActivity()

  return (
    <nav className="bottom-nav">
      <div className="sidebar-brand">BetMates</div>
      {TABS.map((tab) => (
        <NavLink key={tab.to} to={tab.to} className={({ isActive }) => (isActive ? 'bottom-nav-item active' : 'bottom-nav-item')}>
          <span className="bottom-nav-icon">
            <tab.Icon />
            {tab.to === '/groups' && hasNewActivity && <span className="bottom-nav-dot" />}
            {tab.to === '/alerts' && hasUnseenNotifications && <span className="bottom-nav-dot" />}
          </span>
          <span>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
