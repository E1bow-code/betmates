import { useEffect, useState } from 'react'
import { fetchSportPhoto } from '../api/photoClient.js'

// Atmospheric background photo behind a page's header - free-license stock
// photography (Pexels, see netlify/functions/photo.js), not any specific
// athlete/team/event, with a dark gradient scrim so heading text and the
// sport switcher stay readable over it. Renders nothing while loading or
// if no photo came back (offline, quota, unknown sport) - it's pure
// decoration, never something the page should wait on or show an error for.

export default function SportHeroBanner({ sport }) {
  const [url, setUrl] = useState(null)

  useEffect(() => {
    let cancelled = false
    setUrl(null)
    fetchSportPhoto(sport).then((photoUrl) => {
      if (!cancelled) setUrl(photoUrl)
    })
    return () => {
      cancelled = true
    }
  }, [sport])

  if (!url) return null

  return (
    <div className="sport-hero" style={{ backgroundImage: `url(${url})` }}>
      <div className="sport-hero-scrim" />
    </div>
  )
}
