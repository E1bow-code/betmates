// In-play scores for the Tracker's open bets, off the same /api/scores
// endpoint settlement uses (both Odds API and SportsGameOdds sports) - but
// via ?state=live, which returns games in progress instead of finished ones
// (see netlify/functions/scores.js). Keyed
// by the "Home v Away" event string every leg already carries (the same key
// betEvaluation.findGame matches on), so a row can look up its own live
// score with no extra plumbing. Polls while mounted since a live score is
// only interesting if it's current; falls back to the last known scores on a
// transient fetch failure rather than blanking.
import { useEffect, useMemo, useState } from 'react'
import { apiKeysForSport, sgoEventIdForLeg } from './sportsConfig.js'

const REFRESH_MS = 30 * 1000

export function useLiveScores(openEntries) {
  // The distinct API sport keys / SportsGameOdds event IDs the open bets
  // could have a live game under - racing has no live-score feed here
  // (same as settlement), so it's skipped.
  const { apiKeys, sgoIds } = useMemo(() => {
    const keySet = new Set()
    const sgoSet = new Set()
    for (const entry of openEntries ?? []) {
      for (const leg of entry.selections) {
        const sport = leg.sport ?? entry.sport
        if (sport === 'racing') continue
        for (const key of apiKeysForSport(sport)) keySet.add(key)
        const sgoId = sgoEventIdForLeg(leg)
        if (sgoId) sgoSet.add(sgoId)
      }
    }
    return { apiKeys: [...keySet].sort(), sgoIds: [...sgoSet].sort() }
  }, [openEntries])

  const [byEvent, setByEvent] = useState(() => new Map())
  const keyParam = apiKeys.join(',')
  const sgoParam = sgoIds.join(',')

  useEffect(() => {
    if (!keyParam && !sgoParam) {
      setByEvent(new Map())
      return
    }
    let cancelled = false
    const load = async () => {
      try {
        const params = new URLSearchParams({ state: 'live' })
        if (keyParam) params.set('keys', keyParam)
        if (sgoParam) params.set('sgoIds', sgoParam)
        const res = await fetch(`/api/scores?${params}`)
        if (!res.ok) return
        const games = await res.json()
        if (cancelled || !Array.isArray(games)) return
        setByEvent(new Map(games.map((g) => [`${g.homeTeam} v ${g.awayTeam}`, g])))
      } catch {
        // Offline or a blip - keep whatever we last showed.
      }
    }

    // Only poll while the tab is actually visible. A live score is worthless in
    // a backgrounded tab nobody's looking at, and a tab left open all day would
    // otherwise keep hitting /api/scores every 30s (~2,880 function
    // invocations/user/day per open-live window) for nothing - the single
    // biggest per-user cost multiplier in the app. On returning to the tab we
    // reload immediately so the first thing shown is current, not 30s stale.
    let id = null
    const start = () => {
      if (id != null) return
      load()
      id = setInterval(load, REFRESH_MS)
    }
    const stop = () => {
      if (id != null) {
        clearInterval(id)
        id = null
      }
    }
    const onVisibility = () => (document.hidden ? stop() : start())
    if (!document.hidden) start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [keyParam, sgoParam])

  return byEvent
}
