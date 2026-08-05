export async function fetchSportsNews() {
  const res = await fetch('/api/sports-news')
  if (!res.ok) throw new Error(`Failed to load news: ${res.status}`)
  return res.json()
}
