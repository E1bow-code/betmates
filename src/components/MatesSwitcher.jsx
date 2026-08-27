import { NavLink } from 'react-router-dom'

// Discord's own pattern: a small switcher between "your servers" and "your
// DMs", not a 6th BottomNav icon - see src/components/BottomNav.jsx's Mates
// tab, which lands on /groups and widens its own active-highlight to cover
// /friends too. Shared by GroupsHomePage.jsx and FriendsPage.jsx so the
// switcher itself can't drift between the two pages it toggles between.
// Reuses .mode-switcher/.mode-tab (see style.css) rather than inventing a
// second pill-row style - that class already supports a <Link> tab, not
// just a state-toggling <button> one, for exactly this shape.
export default function MatesSwitcher() {
  return (
    <div className="mode-switcher">
      <NavLink to="/groups" end className={({ isActive }) => (isActive ? 'mode-tab active' : 'mode-tab')}>
        Groups
      </NavLink>
      <NavLink to="/friends" className={({ isActive }) => (isActive ? 'mode-tab active' : 'mode-tab')}>
        Friends
      </NavLink>
    </div>
  )
}
