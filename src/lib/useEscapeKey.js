import { useEffect } from 'react'

// Every sheet/modal in the app (bet builder, odds alerts, participant
// profile, video recorder, ...) already closes on a backdrop click - this
// adds the other half of that expectation, Escape, in one place instead of
// each component wiring its own keydown listener. `enabled` exists for
// components that render themselves unconditionally and only show their
// sheet some of the time (see PayoutCalculatorSheet.jsx) - everything else
// only exists in the tree while open, so it can leave this at the default.
export function useEscapeKey(onEscape, enabled = true) {
  useEffect(() => {
    if (!enabled) return
    function handleKeyDown(e) {
      if (e.key === 'Escape') onEscape()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onEscape, enabled])
}
