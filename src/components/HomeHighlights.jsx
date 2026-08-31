import { Link } from 'react-router-dom'
import { ShieldIcon, PulseIcon, MoneyIcon, BrokenHeartIcon } from './icons/Icons.jsx'

const ICON = { shield: ShieldIcon, pulse: PulseIcon, money: MoneyIcon, brokenHeart: BrokenHeartIcon }
// Semantic tone: a near-miss ("the one that got away", brokenHeart) reads warm,
// everything else takes the neutral navy accent - so the cards feel distinct and
// carry the app's colour rather than floating pale on the off-white page.
const TONE = { brokenHeart: 'warn' }

// A horizontally-scrollable row of 1-3 "wrapped"-style stat cards - see
// src/utils/homeHighlights.js for which stats qualify and why. Each card
// teases a fuller page (Tracker's Hall of Fame or Insights) the same way
// RankTeaser teases the full group leaderboard - tap through for the
// complete picture, this is just the glanceable version.
export default function HomeHighlights({ highlights }) {
  if (!highlights.length) return null

  return (
    <div className="home-highlights">
      {highlights.map((h) => {
        const Icon = ICON[h.icon]
        return (
          <Link key={h.key} to={h.to} className={`home-highlight-card tone-${TONE[h.icon] || 'accent'}`}>
            <span className="home-highlight-icon">{Icon && <Icon width={18} height={18} />}</span>
            <span className="home-highlight-title">{h.title}</span>
            <span className="home-highlight-value">{h.value}</span>
          </Link>
        )
      })}
    </div>
  )
}
