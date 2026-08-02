// Shared in-memory response cache for the Netlify Function proxies to The
// Odds API (odds.js, sport.js, ufc.js, scores.js) - the whole point is
// keeping the free 500 req/month tier from getting exhausted by repeat
// requests for data that hasn't meaningfully changed. Netlify reuses warm
// function instances across nearby invocations under normal traffic, so
// this genuinely cuts live API calls even though it's not a durable
// cross-instance/cross-deploy cache - a cold start just means one extra
// live fetch, not a correctness problem.
const store = new Map()

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
  store.set(key, { value, expiresAt: Date.now() + ttlMs })
}
