import { BOOKMAKER_LINKS } from '../lib/bookmakers.js'

// Points at Bet365's own site rather than trying to construct a link to a
// specific match - no UK bookmaker publishes a public URL scheme for "open
// this exact live stream" (same limitation as buildDeepLink in
// bookmakers.js), and Bet365 specifically is well known for free live
// streaming to customers with a funded account, so this is an honest "go
// watch it there" nudge rather than a broken promise of an embedded video.
// BetMates never hosts or embeds any stream itself.
export default function WatchLiveButton() {
  return (
    <a className="btn btn-secondary btn-small watch-live-btn" href={BOOKMAKER_LINKS.Bet365} target="_blank" rel="noreferrer">
      📺 Watch on Bet365
    </a>
  )
}
