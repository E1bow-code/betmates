import { createContext, useCallback, useContext, useMemo, useState } from 'react'

// Global bet-slip state so picks survive navigating between fixtures - tap
// an outcome on the Odds tab, go look at another fixture, tap another
// outcome, and both land in the same slip (a real bet builder / accumulator,
// not just one selection at a time). Legs carry their own `sport` since an
// accumulator can mix sports (see BetBuilderSheet's combined-sport logic).

const BetSlipContext = createContext(null)

function legKey(leg) {
  return `${leg.event}|${leg.market}|${leg.selection}`
}

export function BetSlipProvider({ children }) {
  const [legs, setLegs] = useState([])
  const [sheetOpen, setSheetOpen] = useState(false)

  const toggleLeg = useCallback((leg) => {
    setLegs((prev) => {
      const key = legKey(leg)
      if (prev.some((l) => legKey(l) === key)) return prev.filter((l) => legKey(l) !== key)
      return [...prev, leg]
    })
    setSheetOpen(true)
  }, [])

  const removeLeg = useCallback((leg) => {
    setLegs((prev) => {
      const next = prev.filter((l) => legKey(l) !== legKey(leg))
      if (!next.length) setSheetOpen(false)
      return next
    })
  }, [])

  const clearSlip = useCallback(() => {
    setLegs([])
    setSheetOpen(false)
  }, [])

  // Replaces the slip outright rather than merging - "back this bet" from
  // a friend's post (see BackBetButton.jsx) means exactly their picks, not
  // whatever you already had queued up.
  const loadLegs = useCallback((newLegs) => {
    setLegs(newLegs)
    setSheetOpen(true)
  }, [])

  const isSelected = useCallback((leg) => legs.some((l) => legKey(l) === legKey(leg)), [legs])

  const value = useMemo(
    () => ({
      legs,
      toggleLeg,
      removeLeg,
      clearSlip,
      loadLegs,
      isSelected,
      sheetOpen,
      openSheet: () => setSheetOpen(true),
      closeSheet: () => setSheetOpen(false)
    }),
    [legs, toggleLeg, removeLeg, clearSlip, loadLegs, isSelected, sheetOpen]
  )

  return <BetSlipContext.Provider value={value}>{children}</BetSlipContext.Provider>
}

export function useBetSlip() {
  return useContext(BetSlipContext)
}
