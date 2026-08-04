import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import * as dataStore from '../lib/dataStore.js'
import { computeAchievements } from '../utils/achievements.js'

export default function AchievementsPage() {
  const { user } = useAuth()
  const [entries, setEntries] = useState(null)

  useEffect(() => {
    Promise.all([dataStore.listBetPostsByUser(user.id), dataStore.listManualEntries(user.id)]).then(([posted, manual]) => {
      setEntries([...posted, ...manual])
    })
  }, [user.id])

  if (entries === null) return <div className="loading">Tallying up your achievements…</div>

  const achievements = computeAchievements(entries)
  const earnedCount = achievements.filter((a) => a.earned).length

  return (
    <div>
      <div className="topbar">
        <Link to="/tracker" className="back">
          &larr; Tracker
        </Link>
        <h1>Achievements</h1>
        <p className="race-card-meta">
          {earnedCount} of {achievements.length} unlocked
        </p>
      </div>

      <div className="achievements-grid">
        {achievements.map((a) => (
          <div key={a.id} className={a.earned ? 'achievement-card earned' : 'achievement-card'}>
            <div className="achievement-icon">{a.icon}</div>
            <div className="achievement-label">{a.label}</div>
            <div className="achievement-hint">{a.earned ? 'Unlocked' : a.hint}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
