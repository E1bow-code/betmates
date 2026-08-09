import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import * as dataStore from '../lib/dataStore.js'

// Points Home at the video-tips feature without pulling it fully in - Tips
// is a different content type (talking-to-camera clips, not bet slips) with
// its own card/data layer (VideoCard.jsx, listFriendsFeed), so a full merge
// into the main feed would mean building a second card type into that feed
// rather than the "cleaner, same features" ask this teaser answers. Only
// ever renders when there's an actual tip to point at - same silent-
// omission convention as RankTeaser/HomeHighlights.
export default function HomeTipsTeaser() {
  const { user } = useAuth()
  const [latest, setLatest] = useState(null)

  useEffect(() => {
    dataStore
      .listFriendsFeed(user.id)
      .then((videos) => setLatest(videos[0] ?? null))
      .catch(() => setLatest(null))
  }, [user.id])

  if (!latest) return null

  return (
    <Link to="/social" state={{ segment: 'tips' }} className="home-tips-teaser">
      <span className="home-tips-teaser-icon">🎥</span>
      <span className="home-tips-teaser-body">
        <span className="home-tips-teaser-title">
          {latest.authorId === user.id ? 'Your latest tip' : `${latest.authorName}'s latest tip`}
        </span>
        <span className="home-tips-teaser-context">{latest.caption}</span>
      </span>
      <span className="home-tips-teaser-chevron">›</span>
    </Link>
  )
}
