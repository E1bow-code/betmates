import { useCallback, useState } from 'react'

// Every sheet unmounts itself the instant onClose fires, which is fine
// for the open transition (CSS animation on mount) but leaves no window
// for an exit animation - React removes the DOM node before it can play.
// This delays the real onClose by the CSS transition duration and hands
// back a `closing` flag so the sheet can render its own exit animation
// during that window instead of just vanishing.
export function useDelayedClose(onClose, duration = 200) {
  const [closing, setClosing] = useState(false)
  const requestClose = useCallback(() => {
    setClosing(true)
    setTimeout(() => {
      // Reset before calling onClose - some sheets (MoreMenu) stay
      // mounted and just toggle a boolean rather than unmounting, so a
      // stale `closing: true` would replay the exit animation the next
      // time they open.
      setClosing(false)
      onClose()
    }, duration)
  }, [onClose, duration])
  return { closing, requestClose }
}
