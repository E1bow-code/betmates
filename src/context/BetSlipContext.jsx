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

  // Only auto-opens the sheet going from 0 legs -> 1 - that first tap is
  // the one person needs walking through "post/keep to myself/keep adding".
  // Once they've hit "Keep adding picks", every further tap while browsing
  // should land quietly in the slip (BetSlipBar reflects the count) instead
  // of yanking the sheet back open on top of whatever fixture they're
  // looking at - that's what made building an accumulator feel like it
  // fought you on every single pick.
  const toggleLeg = useCallback((leg) => {
    setLegs((prev) => {
      const key = legKey(leg)
      const next = prev.some((l) => legKey(l) === key) ? prev.filter((l) => legKey(l) !== key) : [...prev, leg]
      if (prev.length === 0 && next.length > 0) setSheetOpen(true)
      return next
    })
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
