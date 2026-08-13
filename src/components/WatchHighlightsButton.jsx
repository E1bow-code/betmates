// The finished-event counterpart to WatchLiveButton.jsx - once hasFinished()
// says the event's over, there's no broadcaster to link to any more, so
// this points at a YouTube search for the real thing instead of pretending
// to know the exact official upload (no video API is wired up anywhere in
// this app - see broadcastLookup.js's own comment on the same limitation).
// BetMates never hosts or embeds any footage itself.
import { FilmIcon } from './icons/Icons.jsx'

export default function WatchHighlightsButton({ query }) {
  const href = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
  return (
    <a className="btn btn-secondary btn-small watch-live-btn icon-row" href={href} target="_blank" rel="noreferrer">
      <FilmIcon width={15} height={15} /> Watch highlights
    </a>
  )
}
