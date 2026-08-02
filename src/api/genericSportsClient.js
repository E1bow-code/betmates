// Adapter for every sport in src/lib/sportsConfig.js - talks to the one
// shared netlify/functions/sport.js instead of a dedicated function per
// sport. Same fetch/error shape as oddsClient.js, racingClient.js, etc.

export async function fetchEvents(sportKey) {
  const res = await fetch(`/api/sport?sport=${encodeURIComponent(sportKey)}`)
  if (!res.ok) throw new Error(`Failed to load events: ${res.status}`)
  return res.json()
}

export async function fetchEvent(sportKey, id) {
  const res = await fetch(`/api/sport?sport=${encodeURIComponent(sportKey)}&id=${encodeURIComponent(id)}`)
  if (!res.ok) throw new Error(`Failed to load event: ${res.status}`)
  return res.json()
}
