import { useEffect, useState } from 'react'
import { BOOKMAKER_LINKS } from '../lib/bookmakers.js'
import { getBroadcastInfo } from '../lib/broadcastLookup.js'
import { TvIcon } from './icons/Icons.jsx'

// Points at Bet365's own site by default rather than trying to construct a
// link to a specific match - no UK bookmaker publishes a public URL scheme
// for "open this exact live stream" (same limitation as buildDeepLink in
// bookmakers.js), and Bet365 specifically is well known for free live
// streaming to customers with a funded account, so that's an honest "go
// watch it there" nudge rather than a broken promise of an embedded video.
//
// When leagueKey/participants/kickoff are passed (see FightDetailPage etc.),
// this first tries to resolve the *actual* broadcaster for that specific
// event via broadcastLookup.js and swaps the label/link to point there
// instead - a real answer to "where is this actually showing" rather than
// just a generic streaming nudge. Falls straight back to Bet365 if no
// confident match is found. BetMates never hosts or embeds any stream itself.
export default function WatchLiveButton({ leagueKey, participants, kickoff }) {
  const [broadcast, setBroadcast] = useState(null)

  // Extracted so the effect keys on the two participant names (primitives)
  // rather than the participants array's identity - a new-but-equal array from
  // a re-render mustn't trigger a refetch. Also satisfies exhaustive-deps'
  // no-complex-expressions check.
  const homeName = participants?.[0]
  const awayName = participants?.[1]
  useEffect(() => {
    if (!leagueKey || !participants) return
    let cancelled = false
    getBroadcastInfo(leagueKey, participants, kickoff).then((info) => {
      if (!cancelled) setBroadcast(info)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-fetch only when the league, the two participant names, or kickoff change; keyed on the names above, not the participants array reference
  }, [leagueKey, homeName, awayName, kickoff])

  const href = broadcast?.url ?? BOOKMAKER_LINKS.Bet365
  const label = broadcast ? `Watch on ${broadcast.broadcaster}` : 'Watch on Bet365'

  return (
    <a className="btn btn-secondary btn-small watch-live-btn icon-row" href={href} target="_blank" rel="noreferrer">
      <TvIcon width={15} height={15} /> {label}
    </a>
  )
}
