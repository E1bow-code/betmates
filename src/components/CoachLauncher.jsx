import { Link, useLocation } from 'react-router-dom'

// Persistent entry point into CoachGPT (src/pages/CoachGptPage.jsx) - a
// floating button rather than a 7th BottomNav icon or a MoreMenu entry,
// so the feature stays one tap away from anywhere instead of buried
// behind a menu. Mirrors .more-menu-trigger's fixed-floating treatment
// (see style.css), mounted on the opposite side so the two triggers
// never collide. Hidden on /coach itself - no point floating a button
// to the page you're already on.
export default function CoachLauncher() {
  const location = useLocation()
  if (location.pathname === '/coach') return null

  return (
    <Link to="/coach" className="coach-fab" aria-label="Ask CoachGPT">
      🧠
    </Link>
  )
}
