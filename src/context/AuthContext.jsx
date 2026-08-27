import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import posthog from 'posthog-js'
import * as dataStore from '../lib/dataStore.js'

const AuthContext = createContext(null)

// A comment here used to claim a listener "still receives the event
// regardless of timing" - not actually guaranteed by Supabase's client.
// PASSWORD_RECOVERY fires once, during the client's own async URL
// processing; a listener that subscribes after that has already happened
// (slower JS boot, or - on the recovery path specifically - a slow/flaky
// mobile connection stalling the network round-trip the client needs to
// validate the token) never sees it, and nothing else told the user
// anything went wrong. This was reported as "the reset link just doesn't
// work on mobile" - the reporter lands back on a normal sign-in screen
// with zero indication anything was even attempted.
const RECOVERY_TIMEOUT_MS = 6000

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [passwordRecovery, setPasswordRecovery] = useState(false)
  const [recoveryFailed, setRecoveryFailed] = useState(false)

  useEffect(() => {
    dataStore
      .getSession()
      .then((sessionUser) => {
        setUser(sessionUser)
        // Identify returning visitors so their anonymous pre-consent session
        // is merged with their known profile when posthog is initialised.
        if (sessionUser?.id) posthog.identify(sessionUser.id)
      })
      .finally(() => setLoading(false))
  }, [])

  // See dataStore.js's onAuthStateChange comment for the event itself.
  // Independently of that, check the URL directly for what a Supabase
  // recovery redirect actually looks like (a `type=recovery` hash
  // fragment) - not to act on it ourselves, just to know a recovery
  // attempt is in flight so a timeout has something to fire against. If
  // the event hasn't arrived by then, something went wrong client-side
  // (network, timing, or the token already being spent) and the user gets
  // told that plainly instead of silently landing back at sign-in.
  useEffect(() => {
    const isRecoveryLink = window.location.hash.includes('type=recovery')
    const unsubscribe = dataStore.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true)
    })
    if (!isRecoveryLink) return unsubscribe

    const timer = setTimeout(() => {
      setPasswordRecovery((already) => {
        if (!already) setRecoveryFailed(true)
        return already
      })
    }, RECOVERY_TIMEOUT_MS)

    return () => {
      unsubscribe()
      clearTimeout(timer)
    }
  }, [])

  const signUp = useCallback(async (fields) => {
    const newUser = await dataStore.signUp(fields)
    setUser(newUser)
    return newUser
  }, [])

  const signIn = useCallback(async (fields) => {
    const existing = await dataStore.signIn(fields)
    setUser(existing)
    return existing
  }, [])

  const signOut = useCallback(async () => {
    await dataStore.signOut()
    // Reset posthog so the next anonymous session starts fresh, unlinked
    // from the signed-out user's distinct ID.
    posthog.reset()
    setUser(null)
  }, [])

  // Re-pulls the full profile row rather than an optimistic patch - unlike
  // every updateX below, premium status changes server-side (Stripe
  // webhook) after the user's already left the app for Checkout, so there's
  // nothing local to merge in. Used once on return from a successful
  // checkout (see AccountPage's ?upgraded=1 handling) to pick up
  // is_premium without needing a manual page reload.
  const refreshUser = useCallback(async () => {
    const fresh = await dataStore.getSession()
    if (fresh) setUser(fresh)
  }, [])

  const deleteAccount = useCallback(async () => {
    if (!user) return
    await dataStore.deleteAccount(user.id)
    setUser(null)
  }, [user])

  const updateDisplayName = useCallback(
    async (displayName) => {
      if (!user) return
      await dataStore.updateDisplayName(user.id, displayName)
      setUser((u) => ({ ...u, displayName }))
    },
    [user]
  )

  const updateBookmakerPrefs = useCallback(
    async (prefs) => {
      if (!user) return
      // Optimistic - every caller (AccountPage's own settings, the
      // first-run wizard) is a chip grid where the checked state reads
      // straight off user.bookmakerPrefs, so without this the chip only
      // lights up after the round-trip completes. Reverts on failure.
      const previous = user.bookmakerPrefs
      setUser((u) => ({ ...u, bookmakerPrefs: prefs }))
      try {
        await dataStore.updateBookmakerPrefs(user.id, prefs)
      } catch (err) {
        setUser((u) => ({ ...u, bookmakerPrefs: previous }))
        throw err
      }
    },
    [user]
  )

  const updateNotificationPrefs = useCallback(
    async (prefs) => {
      if (!user) return
      await dataStore.updateNotificationPrefs(user.id, prefs)
      setUser((u) => ({ ...u, notificationPrefs: prefs }))
    },
    [user]
  )

  const updateAvatar = useCallback(
    async (file) => {
      if (!user) return
      const url = await dataStore.uploadAvatar(user.id, file)
      setUser((u) => ({ ...u, avatarUrl: url }))
    },
    [user]
  )

  const updateStakeLimit = useCallback(
    async (amount, period) => {
      if (!user) return
      await dataStore.updateStakeLimit(user.id, { amount, period })
      setUser((u) => ({ ...u, stakeLimitAmount: amount, stakeLimitPeriod: period }))
    },
    [user]
  )

  const updateLimitBuddy = useCallback(
    async (buddyId) => {
      if (!user) return
      await dataStore.updateLimitBuddy(user.id, buddyId)
      setUser((u) => ({ ...u, limitBuddyId: buddyId }))
    },
    [user]
  )

  const updateStakingPlan = useCallback(
    async (bankrollAmount, stakingRule) => {
      if (!user) return
      await dataStore.updateStakingPlan(user.id, { bankrollAmount, stakingRule })
      setUser((u) => ({ ...u, bankrollAmount, stakingRule }))
    },
    [user]
  )

  const updateSelfExclusion = useCallback(
    async (until) => {
      if (!user) return
      await dataStore.updateSelfExclusion(user.id, until)
      setUser((u) => ({ ...u, selfExclusionUntil: until }))
    },
    [user]
  )

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        passwordRecovery,
        recoveryFailed,
        signUp,
        signIn,
        signOut,
        deleteAccount,
        updateDisplayName,
        updateBookmakerPrefs,
        updateNotificationPrefs,
        updateAvatar,
        updateStakeLimit,
        updateLimitBuddy,
        updateStakingPlan,
        updateSelfExclusion,
        refreshUser
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
