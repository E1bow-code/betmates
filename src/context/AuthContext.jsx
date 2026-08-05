import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import * as dataStore from '../lib/dataStore.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [passwordRecovery, setPasswordRecovery] = useState(false)

  useEffect(() => {
    dataStore
      .getSession()
      .then(setUser)
      .finally(() => setLoading(false))
  }, [])

  // See dataStore.js's onAuthStateChange comment - this is the only
  // reliable way to catch a password-recovery link (App.jsx's Shell used to
  // sniff window.location.hash for it directly, which lost a race against
  // Supabase's own URL cleanup and silently signed people in instead of
  // showing the reset form).
  useEffect(() => {
    return dataStore.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true)
    })
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
    setUser(null)
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
      await dataStore.updateBookmakerPrefs(user.id, prefs)
      setUser((u) => ({ ...u, bookmakerPrefs: prefs }))
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

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        passwordRecovery,
        signUp,
        signIn,
        signOut,
        deleteAccount,
        updateDisplayName,
        updateBookmakerPrefs,
        updateNotificationPrefs,
        updateAvatar,
        updateStakeLimit
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
