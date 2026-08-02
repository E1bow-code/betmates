import { NavLink } from 'react-router-dom'
import { useActivity } from '../context/ActivityContext.jsx'

const TABS = [
  { to: '/odds', label: 'Odds', icon: '⚽' },
  { to: '/groups', label: 'Social', icon: '👥' },
  { to: '/tracker', label: 'Tracker', icon: '📊' },
  { to: '/account', label: 'Account', icon: '⚙️' }
]

export default function BottomNav() {
  const { hasNewActivity } = useActivity()

  return (
    <nav className="bottom-nav">
      {TABS.map((tab) => (
        <NavLink key={tab.to} to={tab.to} className={({ isActive }) => (isActive ? 'bottom-nav-item active' : 'bottom-nav-item')}>
          <span className="bottom-nav-icon">
            {tab.icon}
            {tab.to === '/groups' && hasNewActivity && <span className="bottom-nav-dot" />}
          </span>
          <span>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
