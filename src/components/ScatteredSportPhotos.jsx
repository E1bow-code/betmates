import { useEffect, useState } from 'react'
import { fetchSportPhoto } from '../api/photoClient.js'

// Ambient texture for the whole app shell (rendered once, not per-page) -
// three different sports' banner photos (same cached fetch/photos
// SportHeroBanner already uses, see netlify/functions/photo.js) at fixed
// positions and low, varying opacity. Deliberately position: fixed with a
// negative z-index: that keeps it below every real in-flow element (cards,
// the news ticker, bottom nav) on the page, only ever visible in the empty
// background gaps between them, and never something a tap or a screen
// reader can land on (aria-hidden, pointer-events: none).
const SPORTS = ['football', 'racing', 'ufc']

export default function ScatteredSportPhotos() {
  const [urls, setUrls] = useState([])

  useEffect(() => {
    Promise.all(SPORTS.map((sport) => fetchSportPhoto(sport))).then((results) => setUrls(results.filter(Boolean)))
  }, [])

  if (!urls.length) return null

  return (
    <div className="scattered-photos" aria-hidden="true">
      {urls.map((url, i) => (
        <div key={i} className={`scattered-photo scattered-photo-${i + 1}`} style={{ backgroundImage: `url(${url})` }} />
      ))}
    </div>
  )
}
