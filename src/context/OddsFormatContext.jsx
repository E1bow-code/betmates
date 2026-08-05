import { createContext, useCallback, useContext, useState } from 'react'

// Unlike theme.js (pure CSS/DOM, no React involved), odds format has to
// re-render actual JS-formatted strings across a dozen pages whenever it
// changes, so it's a Context rather than a fire-and-forget localStorage
// helper. Available at the very top of the tree (see App.jsx) rather than
// only inside the authenticated shell, since the logged-out Hall of Fame
// page also renders odds (the underdog record).
const KEY = 'betmates:oddsFormat'
const OddsFormatContext = createContext(null)

function getStored() {
  return localStorage.getItem(KEY) === 'fractional' ? 'fractional' : 'decimal'
}

export function OddsFormatProvider({ children }) {
  const [format, setFormatState] = useState(getStored)

  const setFormat = useCallback((next) => {
    localStorage.setItem(KEY, next)
    setFormatState(next)
  }, [])

  return <OddsFormatContext.Provider value={{ format, setFormat }}>{children}</OddsFormatContext.Provider>
}

export function useOddsFormat() {
  const ctx = useContext(OddsFormatContext)
  if (!ctx) throw new Error('useOddsFormat must be used within OddsFormatProvider')
  return ctx
}
