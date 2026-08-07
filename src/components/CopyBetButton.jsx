import { useState } from 'react'
import { BOOKMAKER_LINKS, buildDeepLink } from '../lib/bookmakers.js'
import * as dataStore from '../lib/dataStore.js'
import { useOddsFormat } from '../context/OddsFormatContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { formatOdds } from '../utils/oddsFormat.js'

// Section 2B's Copy Bet button. Clipboard always; whether there's also an
// "open the bookmaker" side depends on what The Odds API's includeLinks
// feature actually returned for this exact selection (see
// netlify/functions/odds.js/ufc.js/sport.js and src/lib/oddsLinks.js):
//   - a real pre-filled bet slip (currently only Sky Bet ever returns one) -
//     clicking Copy Bet itself also opens it, since the bet's already sat
//     right there in the slip rather than needing a second click,
//   - otherwise just the bookmaker's plain event page or homepage (falling
//     back to src/lib/bookmakers.js's static links for racing/SportsGameOdds
//     sports/mock data) - shown as a separate "Open {bookmaker}" link, since
//     that's not worth auto-opening on every copy.
// Never auto-submits anything; the user places the bet themselves, per the
// legal note in Section 6.

function formatBetSlip(post, format) {
  const lines = post.selections.map((s) => `${s.event} - ${s.market}: ${s.selection} @ ${formatOdds(s.odds, format)} (${s.bookmaker})`)
  const stakeLine = post.stakeHidden || !post.stake ? '' : `\nStake: £${post.stake}${post.potentialReturn ? ` (returns £${post.potentialReturn.toFixed(2)})` : ''}`
  return `BetMates bet slip\n${lines.join('\n')}${stakeLine}`
}

export default function CopyBetButton({ post, userId, copyCount = 0, onCopied }) {
  const [copied, setCopied] = useState(false)
  const { format } = useOddsFormat()
  const { showToast } = useToast()
  const selection = post.selections[0]
  const bookmaker = selection?.bookmaker
  const deepLink = buildDeepLink(bookmaker, selection)
  const link = selection?.link ?? deepLink ?? BOOKMAKER_LINKS[bookmaker]
  const isBetslipLink = Boolean(selection?.linkIsBetslip) || Boolean(deepLink)

  async function handleCopy() {
    // window.open() has to happen synchronously, before any await, or
    // Safari/most mobile browsers no longer treat it as part of the click
    // gesture and silently block it as a popup. Only Sky Bet ever sets
    // isBetslipLink today (see oddsLinks.js) - a real pre-filled slip, not
    // just the bookmaker's homepage - so this is the one case worth
    // auto-opening; the plain "Open {bookmaker}" link below still covers
    // every other bookmaker for a manual click.
    if (isBetslipLink && link) window.open(link, '_blank', 'noopener,noreferrer')

    // Clipboard writes can reject - permission denied, an unfocused page, a
    // browser that just doesn't support it - and this used to have no catch
    // at all, so a rejection silently skipped the copied-state, the count
    // bump, and the recordBetCopy call with zero feedback to the user.
    try {
      await navigator.clipboard.writeText(formatBetSlip(post, format))
    } catch {
      showToast("Couldn't copy - try again")
      return
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    onCopied?.()
    dataStore.recordBetCopy(post.id, userId).catch(() => {})
  }

  return (
    <div className="copy-bet-row">
      <button
        className="btn btn-secondary btn-small"
        onClick={handleCopy}
        aria-label={
          copied
            ? 'Copied to clipboard'
            : `Copy bet${isBetslipLink ? ` and open in ${bookmaker}` : ''}${copyCount > 0 ? ` · copied ${copyCount} time${copyCount === 1 ? '' : 's'}` : ''}`
        }
      >
        {copied ? 'Copied!' : copyCount > 0 ? `Copy Bet · ${copyCount}` : 'Copy Bet'}
      </button>
      {link && !isBetslipLink && (
        <a className="btn btn-ghost btn-small" href={link} target="_blank" rel="noreferrer">
          Open {bookmaker}
        </a>
      )}
    </div>
  )
}
