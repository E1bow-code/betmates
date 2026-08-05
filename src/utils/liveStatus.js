// Whether an event is likely still in progress, purely from its start time
// plus a typical duration for that sport - there's no live-score feed wired
// up for in-play state (see netlify/functions/scores.js, which only ever
// returns *completed* games), so this is deliberately an estimate rather
// than a verified live status. Used to swap a stale "KO" countdown for a
// LIVE badge instead of pretending nothing happened once kickoff passes.
const DURATION_MINUTES = {
  football: 130,
  mls: 130,
  racing: 15,
  ufc: 240,
  boxing: 240,
  tennis: 200,
  basketball: 150,
  hockey: 150,
  baseball: 210,
  nfl: 210,
  rugbyLeague: 120,
  rugbyUnion: 120,
  cricket: 360
}

export function isLive(iso, sport) {
  if (!iso) return false
  const start = new Date(iso).getTime()
  const now = Date.now()
  const duration = (DURATION_MINUTES[sport] ?? 150) * 60000
  return now >= start && now < start + duration
}
