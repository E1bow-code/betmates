import { useBetSlip } from '../context/BetSlipContext.jsx'
import { useOddsFormat } from '../context/OddsFormatContext.jsx'
import { formatOdds } from '../utils/oddsFormat.js'

// Pinned above the bottom nav whenever the slip has picks in it but the
// sheet itself is closed (e.g. user backed out to go add another leg from
// a different fixture) - a visible reminder the slip isn't empty, and the
// way back into it.

export default function BetSlipBar() {
  const { legs, sheetOpen, openSheet } = useBetSlip()
  const { format } = useOddsFormat()

  if (!legs.length || sheetOpen) return null

  const combinedOdds = legs.reduce((acc, leg) => acc * leg.odds, 1)

  return (
    <button className="bet-slip-bar" onClick={openSheet}>
      <span>
        {legs.length} pick{legs.length > 1 ? 's' : ''}
      </span>
      <span className="bet-slip-bar-odds">{formatOdds(combinedOdds, format)}</span>
    </button>
  )
}
