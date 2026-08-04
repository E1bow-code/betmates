import { useState } from 'react'
import { isIOS, isStandalone } from '../lib/platform.js'
import InstallGuide from './InstallGuide.jsx'

const DISMISSED_KEY = 'betmates:installBannerDismissed'

export default function InstallGuideBanner() {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === '1')

  if (dismissed || !isIOS() || isStandalone()) return null

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, '1')
    setDismissed(true)
  }

  return (
    <div className="install-banner">
      <div className="install-banner-header">
        <strong>Add BetMates to your Home Screen</strong>
        <button className="install-banner-close" onClick={dismiss} aria-label="Dismiss">
          ✕
        </button>
      </div>
      <InstallGuide />
      <p className="hint">You can find these steps again anytime in Account.</p>
    </div>
  )
}
