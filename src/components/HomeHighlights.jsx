import { Link } from 'react-router-dom'

// A horizontally-scrollable row of 1-3 "wrapped"-style stat cards - see
// src/utils/homeHighlights.js for which stats qualify and why. Each card
// teases a fuller page (Tracker's Hall of Fame or Insights) the same way
// RankTeaser teases the full group leaderboard - tap through for the
// complete picture, this is just the glanceable version.
export default function HomeHighlights({ highlights }) {
  if (!highlights.length) return null

  return (
    <div className="home-highlights">
      {highlights.map((h) => (
        <Link key={h.key} to={h.to} className="home-highlight-card">
          <span className="home-highlight-icon">{h.icon}</span>
          <span className="home-highlight-title">{h.title}</span>
          <span className="home-highlight-value">{h.value}</span>
        </Link>
      ))}
    </div>
  )
}
