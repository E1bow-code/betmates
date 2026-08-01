import { useState } from 'react'
import { BOOKMAKER_LINKS, buildDeepLink } from '../lib/bookmakers.js'
import * as dataStore from '../lib/dataStore.js'

// Section 2B's Copy Bet button: clipboard + "open bookmaker" always;
// pre-filled deep link when src/lib/bookmakers.js has a verified scheme
// for that bookmaker (none do yet - see the comment there). Never
// auto-submits anything; the user places the bet themselves, per the
// legal note in Section 6.

function formatBetSlip(post) {
  const lines = post.selections.map((s) => `${s.event} - ${s.market}: ${s.selection} @ ${s.odds.toFixed(2)} (${s.bookmaker})`)
  const stakeLine = post.stakeHidden || !post.stake ? '' : `\nStake: £${post.stake}${post.potentialReturn ? ` (returns £${post.potentialReturn.toFixed(2)})` : ''}`
  return `BetMates bet slip\n${lines.join('\n')}${stakeLine}`
}

export default function CopyBetButton({ post, userId }) {
  const [copied, setCopied] = useState(false)
  const selection = post.selections[0]
  const bookmaker = selection?.bookmaker
  const deepLink = buildDeepLink(bookmaker, selection)
  const link = deepLink ?? BOOKMAKER_LINKS[bookmaker]

  async function handleCopy() {
    await navigator.clipboard.writeText(formatBetSlip(post))
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
          {deepLink ? `Open in ${bookmaker}` : `Open ${bookmaker}`}
        </a>
      )}
    </div>
  )
}
