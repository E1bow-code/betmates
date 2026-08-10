import { useEffect } from 'react'
import { useBetSlip } from '../context/BetSlipContext.jsx'

// The floating bet-slip bar (BetSlipBar.jsx) is position:fixed, so it doesn't
// push page content - which meant the last row of a long list could sit behind
// it, un-tappable, whenever the slip had picks. This mirrors exactly when that
// bar is on screen (picks present, sheet closed) onto a body class so the CSS
// can reserve extra bottom padding on .app-content only then, rather than
// permanently wasting a bar's worth of space on every page.
export default function SlipBarSpacer() {
  const { legs, sheetOpen } = useBetSlip()
  const barVisible = legs.length > 0 && !sheetOpen

  useEffect(() => {
    document.body.classList.toggle('slip-bar-open', barVisible)
    return () => document.body.classList.remove('slip-bar-open')
  }, [barVisible])

  return null
}
