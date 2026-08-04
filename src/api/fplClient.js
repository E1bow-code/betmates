export async function fetchFplEntry(entryId) {
  const res = await fetch(`/api/fpl?entry=${encodeURIComponent(entryId)}`)
  const body = await res.json()
  if (body.error) throw new Error(body.error)
  return body
}

export async function fetchFplLeague(leagueId) {
  const res = await fetch(`/api/fpl?league=${encodeURIComponent(leagueId)}`)
  const body = await res.json()
  if (body.error) throw new Error(body.error)
  return body
}
