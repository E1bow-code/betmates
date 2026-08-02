// Small arrow next to a price when it's shortened or drifted since the
// last time this browser looked at this exact outcome - see
// src/lib/oddsMemory.js for how "last time" is tracked.
export default function OddsMoveIndicator({ direction }) {
  if (!direction) return null
  return (
    <span className="odds-move" title={direction === 'up' ? 'Odds have drifted' : 'Odds have shortened'}>
      {direction === 'up' ? '▲' : '▼'}
    </span>
  )
}
