import Avatar from './Avatar.jsx'
import UserLink from './UserLink.jsx'

const TIERS = ['gold', 'silver', 'bronze']

// Top-3 glanceable teaser sitting above a ranked list's full detail rows -
// same "compact teaser, full detail below" pattern as RankTeaser/
// HomeHighlights on Home. Kept content-light (avatar, name, one headline
// number) on purpose, unlike the full rows below it which also carry win
// rate/ROI/badges/follow buttons - that's what keeps this a real 3-up row
// even on a narrow phone screen. Reuses the same avatar-tier-gold/-silver/
// -bronze glow rings achievement flair already uses elsewhere, so "you're
// on the podium" reads as the same signal in both places.
export default function LeaderboardPodium({ entries }) {
  if (entries.length < 2) return null
  return (
    <div className="leaderboard-podium">
      {entries.slice(0, 3).map((e, i) => (
        <UserLink key={e.userId} id={e.userId} className={`leaderboard-podium-card leaderboard-podium-card--${TIERS[i]}`}>
          <Avatar name={e.name} size={40} tier={TIERS[i]} />
          <span className="leaderboard-podium-name">{e.name}</span>
          <span className={`leaderboard-podium-value${e.tone ? ` tone-${e.tone}` : ''}`}>{e.value}</span>
        </UserLink>
      ))}
    </div>
  )
}
