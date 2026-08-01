// Supabase is optional at dev-time: if env vars aren't set, dataStore.js
// falls back to a localStorage-backed mock so the app is fully usable
// before a real Supabase project exists. See supabase/schema.sql for the
// table definitions to run once a project is created.

import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = url && anonKey ? createClient(url, anonKey) : null
export const isSupabaseConfigured = Boolean(supabase)
