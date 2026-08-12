import { createContext, useContext, useState } from 'react'

const QuickAddContext = createContext(null)

// Lets any page open the same global "Log a bet" sheet BottomNav's center
// FAB opens (see App.jsx's Shell) - added for HomePage's Facebook-style
// composer bar, which needs to trigger it from a routed page component
// rather than a nav button passed a callback prop.
export function QuickAddProvider({ children }) {
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  return (
    <QuickAddContext.Provider
      value={{ showQuickAdd, openQuickAdd: () => setShowQuickAdd(true), closeQuickAdd: () => setShowQuickAdd(false) }}
    >
      {children}
    </QuickAddContext.Provider>
  )
}

export function useQuickAdd() {
  return useContext(QuickAddContext)
}
