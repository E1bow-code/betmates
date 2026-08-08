import { Link } from 'react-router-dom'

// A tappable entry into CoachGPT (src/pages/CoachGptPage.jsx) pre-loaded
// with a question about whatever's on screen, rather than making someone
// open the chat and type out the matchup themselves. Navigates with router
// state carrying the question text; CoachGptPage sends it automatically on
// arrival. Football fixtures first (see FixtureDetailPage.jsx) - other
// detail pages (UFC, racing) can reuse this once that's proven out.
export default function CoachGptLink({ question, label = '🧠 Ask CoachGPT' }) {
  return (
    <Link to="/coach" state={{ prefill: question }} className="btn btn-secondary btn-small">
      {label}
    </Link>
  )
}
