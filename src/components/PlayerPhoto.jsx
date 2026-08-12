import { useEffect, useState } from 'react'
import { getPlayerPhoto } from '../lib/playerPhotos.js'

function initialsFor(name) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

export default function PlayerPhoto({ name, sport, size = 28 }) {
  const [src, setSrc] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setSrc(null)
    setFailed(false)
    getPlayerPhoto(name, sport).then((url) => {
      if (cancelled) return
      if (url) setSrc(url)
      else setFailed(true)
    })
    return () => {
      cancelled = true
    }
  }, [name, sport])

  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        className="player-photo"
        loading="lazy"
        style={{ width: size, height: size }}
        onError={() => setFailed(true)}
      />
    )
  }

  return (
    <span className="player-photo player-photo-fallback" style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {initialsFor(name)}
    </span>
  )
}
