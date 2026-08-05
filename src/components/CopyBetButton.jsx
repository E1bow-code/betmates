import { useState } from 'react'
import { BOOKMAKER_LINKS, buildDeepLink } from '../lib/bookmakers.js'
import * as dataStore from '../lib/dataStore.js'
import { useOddsFormat } from '../context/OddsFormatContext.jsx'
import { formatOdds } from '../utils/oddsFormat.js'

// Section 2B's Copy Bet button: clipboard + "open bookmaker" always.
// The "open" link prefers whatever The Odds API's includeLinks feature
// actually returned for this exact selection (see netlify/functions/odds.js
// /ufc.js/sport.js and src/lib/oddsLinks.js) - a real pre-filled bet-slip
// link where the bookmaker supports it (currently just Sky Bet), the
// specific event's own page otherwise. Falls back to src/lib/bookmakers.js's
// static homepage/DEEP_LINK_BUILDERS chain only when no live link came
// through at all (racing, SportsGameOdds sports, or mock data). Never
// auto-submits anything; the user places the bet themselves, per the
// legal note in Section 6.

function formatBetSlip(post, format) {
  const lines = post.selections.map((s) => `${s.event} - ${s.market}: ${s.selection} @ ${formatOdds(s.odds, format)} (${s.bookmaker})`)
  const stakeLine = post.stakeHidden || !post.stake ? '' : `\nStake: £${post.stake}${post.potentialReturn ? ` (returns £${post.potentialReturn.toFixed(2)})` : ''}`
  return `BetMates bet slip\n${lines.join('\n')}${stakeLine}`
}

export default function CopyBetButton({ post, userId }) {
  const [copied, setCopied] = useState(false)
  const { format } = useOddsFormat()
  const selection = post.selections[0]
  const bookmaker = selection?.bookmaker
  const deepLink = buildDeepLink(bookmaker, selection)
  const link = selection?.link ?? deepLink ?? BOOKMAKER_LINKS[bookmaker]
  const isBetslipLink = Boolean(selection?.linkIsBetslip) || Boolean(deepLink)

  async function handleCopy() {
    await navigator.clipboard.writeText(formatBetSlip(post, format))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    dataStore.recordBetCopy(post.id, userId).catch(() => {})
  }

  return (
    <div className="copy-bet-row">
      <button className="btn btn-secondary btn-small" onClick={handleCopy}>
        {copied ? 'Copied!' : 'Copy Bet'}
      </button>
      {link && (
        <a className="btn btn-ghost btn-small" href={link} target="_blank" rel="noreferrer">
          {isBetslipLink ? `Open in ${bookmaker}` : `Open ${bookmaker}`}
        </a>
      )}
    </div>
  )
}
