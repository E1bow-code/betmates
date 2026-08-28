import { FlameIcon } from './icons/Icons.jsx'

// A "🔥 N" win-streak chip shown next to a member's name on the group
// leaderboard - the in-app counterpart to the streak-milestone push
// (streak-reminders.js), and the place a "rivalry" reads strongest (rank and
// current run side by side). Lights only from two wins up (a single win isn't
// a streak); `count` is the member's current consecutive-win run, computed by
// computeGroupLeaderboard off the shared computeStreak. Reuses the
// .tipster-badge "small chip next to a name" family, in the win colour.
export default function WinStreakBadge({ count }) {
  if (!count || count < 2) return null
  return (
    <span className="chip chip--pill chip--sm tipster-badge icon-row win-streak-badge" title={`On a ${count}-win streak`}>
      <FlameIcon width={13} height={13} /> {count}
    </span>
  )
}
