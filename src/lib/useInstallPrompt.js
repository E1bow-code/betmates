import { useEffect, useState } from 'react'
import { canPromptInstall, onInstallAvailabilityChange } from './installPrompt.js'

// True when the browser has offered a native install prompt we've stashed
// (Chrome/Edge/Android). Re-renders when that changes - the event can fire
// after this hook first mounts, or clear once the user installs.
export function useInstallPrompt() {
  const [available, setAvailable] = useState(canPromptInstall())
  useEffect(() => onInstallAvailabilityChange(setAvailable), [])
  return available
}
