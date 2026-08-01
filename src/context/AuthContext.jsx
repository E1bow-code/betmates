import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import * as dataStore from '../lib/dataStore.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    dataStore
      .getSession()
      .then(setUser)
      .finally(() => setLoading(false))
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

  return (
    <AuthContext.Provider
      value={{ user, loading, signUp, signIn, signOut, updateBookmakerPrefs, updateNotificationPrefs }}
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
