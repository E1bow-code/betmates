// sessionStorage cache on top of the server-side one in netlify/functions/
// photo.js - avoids re-fetching the same sport's banner on every mount
// within a session (switching sport tabs back and forth, revisiting a
// fixture page, etc).
export async function fetchSportPhoto(sport) {
  const cacheKey = `betmates:photo:${sport}`
  const cached = sessionStorage.getItem(cacheKey)
  if (cached) return cached === 'null' ? null : cached

  try {
    const res = await fetch(`/api/photo?sport=${encodeURIComponent(sport)}`)
    if (!res.ok) return null
    const { url } = await res.json()
    sessionStorage.setItem(cacheKey, url ?? 'null')
    return url
  } catch {
    return null
  }
}
