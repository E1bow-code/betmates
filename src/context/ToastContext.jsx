import { createContext, useCallback, useContext, useState } from 'react'

// Lightweight confirmation toast for actions that otherwise give zero
// feedback beyond a page navigation - posting a bet or saving to Tracker,
// for instance, currently just redirects with nothing to confirm it
// actually worked. Not meant to replace inline state (Copy Bet's own
// "Copied!" label, a follow button's active state) - only for the gaps
// where nothing else says "done".
const ToastContext = createContext(null)
const TOAST_MS = 2800

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const showToast = useCallback((message) => {
    const id = `${Date.now()}-${Math.random()}`
    setToasts((t) => [...t, { id, message }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), TOAST_MS)
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
