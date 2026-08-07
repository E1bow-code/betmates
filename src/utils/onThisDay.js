// Resurfaces a bet from the same calendar day in a previous year, Spotify-
// Wrapped style - built entirely from createdAt, already stored on every
// bet/manual entry, no new table. Deliberately a real "on this day" (same
// month + day, any earlier year), not "a month ago" or similar - a match
// only turns up once the app's been used for over a year, which is honest
// rather than padding the card with something that isn't actually a memory.
export function findOnThisDayEntries(entries, now = new Date()) {
  const month = now.getMonth()
  const day = now.getDate()
  return (entries ?? [])
    .filter((e) => {
      const created = new Date(e.createdAt)
      return created.getMonth() === month && created.getDate() === day && created.getFullYear() < now.getFullYear()
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}
