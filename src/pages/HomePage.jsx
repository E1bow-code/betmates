import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import * as dataStore from '../lib/dataStore.js'
import { computeStreak } from '../utils/trackerStats.js'
import SportHeroBanner from '../components/SportHeroBanner.jsx'
import PublicFeedView from '../components/PublicFeedView.jsx'

// The front door post-login (see App.jsx's HomeRedirect) - the public feed
// is the main attraction, everything else the old DashboardPage duplicated
// (P&L, open bets, recent activity) already lives one tap away on Tracker/
// Alerts, so it isn't repeated here. Just a greeting hero (with the streak
// badge, the one bit of personal state worth surfacing before you even
// scroll) + the same PublicFeedView SocialFeedPage's Feed segment renders.
export default function HomePage() {
  const { user } = useAuth()
  const [entries, setEntries] = useState(null)

  useEffect(() => {
    Promise.all([dataStore.listBetPostsByUser(user.id), dataStore.listManualEntries(user.id)])
      .then(([posted, manual]) => setEntries([...posted, ...manual]))
      .catch(() => setEntries([]))
  }, [user.id])

  const streak = useMemo(() => (entries ? computeStreak(entries) : { type: null, count: 0 }), [entries])

  const now = new Date()
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening'
  const firstName = user.displayName?.split(' ')[0] ?? 'there'
  const dateLabel = now.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })

  return (
    <div>
      <SportHeroBanner sport="dashboard" />

      <div className="dashboard-hero">
        <p className="dashboard-hero-date">{dateLabel}</p>
        <h1 className="dashboard-hero-greeting">
          {greeting}, {firstName}
        </h1>
        {streak.count >= 2 && (
          <div className="dashboard-hero-streak">
            {streak.type === 'won' ? '🔥' : '🥶'} {streak.count}-{streak.type === 'won' ? 'win' : 'loss'} streak
          </div>
        )}
      </div>

      <PublicFeedView />
    </div>
  )
}
