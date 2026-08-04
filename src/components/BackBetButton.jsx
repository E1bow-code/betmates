import { useBetSlip } from '../context/BetSlipContext.jsx'

// Loads a friend's picks straight into your own bet slip so you can adjust
// stake and post/save it as your own entry - distinct from CopyBetButton.jsx,
// which copies the slip as text for pasting into a real bookmaker and never
// touches BetMates' own bet-builder state. Uses the odds/bookmaker exactly
// as they were when posted (same call as TrackerPage's "Bet again") rather
// than trying to re-match a live price, which may not even exist anymore
// for a fixture that's already kicked off.
export default function BackBetButton({ post }) {
  const { loadLegs } = useBetSlip()

  return (
    <button className="btn btn-secondary btn-small" onClick={() => loadLegs(post.selections)}>
      Back this
    </button>
  )
}
