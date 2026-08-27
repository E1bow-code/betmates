import LiveBadge from './LiveBadge.jsx'

// Renders a live score next to LiveBadge for a game object from
// useLiveScores (src/lib/liveScores.js) - null until both scores are in
// (kickoff has passed but the provider hasn't posted a score yet).
export default function LiveScoreTag({ game }) {
  const home = game.scores?.find((s) => s.name === game.homeTeam)?.score
  const away = game.scores?.find((s) => s.name === game.awayTeam)?.score
  if (!Number.isFinite(home) || !Number.isFinite(away)) return null
  return (
    <span className="live-score-tag">
      <LiveBadge />
      <span className="live-score">
        {home}&ndash;{away}
      </span>
    </span>
  )
}
