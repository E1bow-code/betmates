import { useState } from 'react'
import { isIOS, isStandalone } from '../lib/platform.js'
import { useInstallPrompt } from '../lib/useInstallPrompt.js'
import { promptInstall } from '../lib/installPrompt.js'
import InstallGuide from './InstallGuide.jsx'
import { DownloadIcon, XIcon } from './icons/Icons.jsx'

const DISMISSED_KEY = 'betmates:installBannerDismissed'

// One nudge onto the home screen, tailored per platform:
//   - Chrome/Edge/Android: a real one-tap "Install" (fires the native prompt)
//   - iOS Safari: the manual Share -> Add to Home Screen guide (no API there)
//   - already installed, or a browser that offers neither: nothing, rather
//     than a dead banner.
export default function InstallGuideBanner() {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === '1')
  const canInstall = useInstallPrompt()

  if (dismissed || isStandalone()) return null
  const showNative = canInstall
  const showIos = !canInstall && isIOS()
  if (!showNative && !showIos) return null

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, '1')
    setDismissed(true)
  }

  async function install() {
    const outcome = await promptInstall()
    // Accepted -> it's installing, so retire the banner. Dismissed -> leave it
    // up; they can try again or close it themselves.
    if (outcome === 'accepted') dismiss()
  }

  return (
    <div className="install-banner">
      <div className="install-banner-header">
        <strong className={showNative ? 'icon-row' : undefined}>
          {showNative ? (
            <>
              <DownloadIcon width={16} height={16} /> Install BetMates
            </>
          ) : (
            'Add BetMates to your Home Screen'
          )}
        </strong>
        <button className="install-banner-close" onClick={dismiss} aria-label="Dismiss">
          <XIcon width={14} height={14} />
        </button>
      </div>
      {showNative ? (
        <>
          <p className="hint">Full-screen app with push alerts, one tap — no App Store needed.</p>
          <button className="btn btn-primary btn-small install-banner-cta" onClick={install}>
            Install app
          </button>
        </>
      ) : (
        <>
          <InstallGuide />
          <p className="hint">You can find these steps again anytime in Account.</p>
        </>
      )}
    </div>
  )
}
