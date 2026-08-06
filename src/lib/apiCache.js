// Shared in-memory response cache for the Netlify Function proxies to The
// Odds API (odds.js, sport.js, ufc.js, scores.js) - the whole point is
// keeping the free 500 req/month tier from getting exhausted by repeat
// requests for data that hasn't meaningfully changed. Netlify reuses warm
// function instances across nearby invocations under normal traffic, so
// this genuinely cuts live API calls even though it's not a durable
// cross-instance/cross-deploy cache - a cold start just means one extra
// live fetch, not a correctness problem.
const store = new Map()

// Entries were only ever dropped when something read them again, so a key
// that's written once and never re-read - a fixture id that's finished, a
// sport nobody opens twice - stayed in a warm instance's memory for its
// whole life, holding a full API response. Sweeping expired entries on
// write bounds that by TTL instead of by luck, and the hard cap is a
// backstop for the case where they're all still live: evict oldest-first,
// since Map iterates in insertion order.
const MAX_ENTRIES = 200

export function cacheGet(key) {
  const entry = store.get(key)
  if (!entry) return undefined
  if (Date.now() > entry.expiresAt) {
    store.delete(key)
    return undefined
  }
  return entry.value
}

export function cacheSet(key, value, ttlMs) {
  const now = Date.now()
  for (const [k, entry] of store) {
    if (now > entry.expiresAt) store.delete(k)
  }
  // Re-inserting an existing key has to move it to the back of the eviction
  // order, not leave it where it first landed.
  store.delete(key)
  store.set(key, { value, expiresAt: now + ttlMs })
  while (store.size > MAX_ENTRIES) {
    store.delete(store.keys().next().value)
  }
}
