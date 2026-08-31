import { useEffect, useState } from 'react'
import { getTeamBadge } from '../lib/teamBadges.js'

function initialsFor(name) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase()
  return words.map((w) => w[0]).join('').slice(0, 3).toUpperCase()
}

export default function TeamBadge({ team, sport, size = 24 }) {
  const [src, setSrc] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setSrc(null)
    setFailed(false)
    getTeamBadge(team, sport).then((url) => {
      if (cancelled) return
      if (url) setSrc(url)
      else setFailed(true)
    })
    return () => {
      cancelled = true
    }
  }, [team, sport])

  if (src && !failed) {
    return (
      // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- onError is a broken-image fallback (swap to initials), not a user interaction
      <img
        src={src}
        alt=""
        className="team-badge"
        loading="lazy"
        style={{ width: size, height: size }}
        onError={() => setFailed(true)}
      />
    )
  }

  return (
    <span className="team-badge team-badge-fallback" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initialsFor(team)}
    </span>
  )
}
