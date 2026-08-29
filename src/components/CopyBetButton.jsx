import { useState } from 'react'
import { BOOKMAKER_LINKS, buildDeepLink, withAffiliate } from '../lib/bookmakers.js'
import * as dataStore from '../lib/dataStore.js'
import { useOddsFormat } from '../context/OddsFormatContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { formatOdds } from '../utils/oddsFormat.js'
import { formatGBP } from '../utils/format.js'

// Section 2B's Copy Bet button. One action, one click: copies the slip as
// text and opens the bookmaker link in the same gesture, whenever a link
// exists at all - a real pre-filled bet slip (currently only Sky Bet ever
// returns one via The Odds API's includeLinks feature, see
// netlify/functions/odds.js/ufc.js/sport.js and src/lib/oddsLinks.js) or
// just the bookmaker's plain event page/homepage (falling back to
// src/lib/bookmakers.js's static links for racing/SportsGameOdds sports/mock
// data). This used to only auto-open for the real-prefilled-slip case and
// made everything else a separate "Open {bookmaker}" link the user had to
// notice and click themselves - inconsistent, and easy to miss when there
// was no visible cue for which case you'd get. Never auto-submits anything;
// the user places the bet themselves, per the legal note in Section 6.

function formatBetSlip(post, format) {
  const lines = post.selections.map((s) => `${s.event} - ${s.market}: ${s.selection} @ ${formatOdds(s.odds, format)} (${s.bookmaker})`)
  const stakeLine = post.stakeHidden || !post.stake ? '' : `\nStake: ${formatGBP(post.stake)}${post.potentialReturn ? ` (returns ${formatGBP(post.potentialReturn)})` : ''}`
  return `BetMates bet slip\n${lines.join('\n')}${stakeLine}`
}

export default function CopyBetButton({ post, userId, copyCount = 0, onCopied }) {
  const [copied, setCopied] = useState(false)
  const { format } = useOddsFormat()
  const { showToast } = useToast()
  const selection = post.selections[0]
  const bookmaker = selection?.bookmaker
  const deepLink = buildDeepLink(bookmaker, selection)
  // Affiliate tag is applied to the final resolved link, so a deep event/slip
  // link from The Odds API earns commission too, not just the homepage fallback.
  const link = withAffiliate(bookmaker, selection?.link ?? deepLink ?? BOOKMAKER_LINKS[bookmaker])
  const isBetslipLink = Boolean(selection?.linkIsBetslip) || Boolean(deepLink)

  async function handleCopy() {
    // window.open() has to happen synchronously, before any await, or
    // Safari/most mobile browsers no longer treat it as part of the click
    // gesture and silently block it as a popup. Opens for any known link
    // now, not just a real pre-filled slip - see the header comment on why.
    if (link) window.open(link, '_blank', 'noopener,noreferrer')

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
    // The button label already flips to "Copied!" for a couple of seconds,
    // but that's silent about the tab that may have just opened behind it -
    // this toast is what actually tells the user where their bet slip went.
    showToast(isBetslipLink ? `Copied - opened your slip in ${bookmaker}` : link ? `Copied - opening ${bookmaker}` : 'Copied to your clipboard')
  }

  return (
    <div className="copy-bet-row">
      <button
        className="btn btn-secondary btn-small"
        onClick={handleCopy}
        aria-label={
          copied
            ? 'Copied to clipboard'
            : `Copy bet${link ? ` and open ${bookmaker}` : ''}${copyCount > 0 ? ` · copied ${copyCount} time${copyCount === 1 ? '' : 's'}` : ''}`
        }
      >
        {copied ? 'Copied!' : copyCount > 0 ? `Copy Bet · ${copyCount}` : 'Copy Bet'}
      </button>
    </div>
  )
}
