// Client-side "has this price moved since I last looked" tracking - no
// backend involved. supabase/schema.sql has an odds_snapshots table from
// the original brief for a real server-side price-history feed, but
// nothing writes to it yet (it'd need a service-role key and a snapshot
// job); this is the cheap version that actually ships: a localStorage
// cache of the last price seen per outcome, per device. Loses history and
// cross-device consistency, but delivers the actual user-visible feature
// (an arrow when a price has shortened or drifted) without new infra.
import { useEffect, useState } from 'react'

const CACHE_KEY = 'betmates:oddsCache'
const MAX_ENTRIES = 500

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY)) ?? {}
  } catch {
    return {}
  }
}

function writeCache(cache) {
  const keys = Object.keys(cache)
  if (keys.length > MAX_ENTRIES) {
    for (const key of keys.slice(0, keys.length - MAX_ENTRIES)) delete cache[key]
  }
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
}

// `ns` namespaces the "last price seen" so different views can track the
// same outcome independently. The odds list and a fixture's detail page both
// show the h2h price; without separate namespaces whichever rendered first
// would record the price and the other would never show an arrow. 'detail'
// is the default so existing callers are unchanged.
export function movementKey(eventId, marketKey, outcomeName, ns = 'detail') {
  return `${ns}|${eventId}|${marketKey}|${outcomeName}`
}

// Returns 'up' | 'down' | null for this view, and updates the cache to
// the new price - the next view compares against *this* one, not
// whatever the price was several views ago.
function trackMovement(key, price) {
  const cache = readCache()
  const prev = cache[key]
  cache[key] = price
  writeCache(cache)
  if (prev === undefined || prev === price) return null
  return price > prev ? 'up' : 'down'
}

// event: { id, markets: [{ key, outcomes: [{ name, bestOdds: { decimal } }] }] }
// Always compares the unfiltered best price (not whatever "my bookies
// only" happens to be showing), so toggling that filter can't be
// mistaken for the market itself moving.
export function useOddsMovement(event, ns = 'detail') {
  const [movements, setMovements] = useState({})

  useEffect(() => {
    if (!event) return
    const next = {}
    for (const market of event.markets) {
      for (const outcome of market.outcomes) {
        const price = outcome.bestOdds?.decimal
        if (price == null) continue
        const key = movementKey(event.id, market.key, outcome.name, ns)
        const dir = trackMovement(key, price)
        if (dir) next[key] = dir
      }
    }
    setMovements(next)
  }, [event, ns])

  return movements
}

// --- Price history (for the detail-page sparkline) ----------------------
// The same "cheap version that ships" idea as the movement cache above, one
// step further: instead of only the last price, keep a short, capped series
// of the best price each time this device has viewed an outcome. It's a
// per-device sample (points land only when someone opens the page and the
// price has changed since last time), not the regular server-side sampling
// the unused odds_snapshots table was meant for - but it needs no backend
// and gives a real "which way has this drifted" trend line.
const HISTORY_KEY = 'betmates:oddsHistory'
const MAX_POINTS = 24 // per outcome - a few weeks of "opened it and it moved"
const MAX_HISTORY_KEYS = 400

function readHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) ?? {}
  } catch {
    return {}
  }
}

function writeHistory(store) {
  const keys = Object.keys(store)
  if (keys.length > MAX_HISTORY_KEYS) {
    for (const key of keys.slice(0, keys.length - MAX_HISTORY_KEYS)) delete store[key]
  }
  localStorage.setItem(HISTORY_KEY, JSON.stringify(store))
}

export function historyKey(eventId, marketKey, outcomeName) {
  return `${eventId}|${marketKey}|${outcomeName}`
}

// Records this view's best price for every outcome (skipping a point when it
// hasn't moved since the last one, so revisiting without a change doesn't pad
// the series or fake a flat line) and returns each outcome's series as
// [{ t, p }]. Reads the unfiltered bestOdds, same as useOddsMovement, so the
// trend is the market's, not a filtered subset's.
export function useOddsHistory(event) {
  const [histories, setHistories] = useState({})

  useEffect(() => {
    if (!event) return
    const store = readHistory()
    const result = {}
    for (const market of event.markets) {
      for (const outcome of market.outcomes) {
        const price = outcome.bestOdds?.decimal
        if (price == null) continue
        const key = historyKey(event.id, market.key, outcome.name)
        const series = store[key] ?? []
        const last = series[series.length - 1]
        const next = last && last.p === price ? series : [...series, { t: Date.now(), p: price }].slice(-MAX_POINTS)
        store[key] = next
        result[key] = next
      }
    }
    writeHistory(store)
    setHistories(result)
  }, [event])

  return histories
}
