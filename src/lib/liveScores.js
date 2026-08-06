// In-play scores for the Tracker's open bets, off the same Odds API /scores
// endpoint settlement uses - but via ?state=live, which returns games in
// progress instead of finished ones (see netlify/functions/scores.js). Keyed
// by the "Home v Away" event string every leg already carries (the same key
// betEvaluation.findGame matches on), so a row can look up its own live
// score with no extra plumbing. Polls while mounted since a live score is
// only interesting if it's current; falls back to the last known scores on a
// transient fetch failure rather than blanking.
import { useEffect, useMemo, useState } from 'react'
import { apiKeysForSport } from './sportsConfig.js'

const REFRESH_MS = 30 * 1000

export function useLiveScores(openEntries) {
  // The distinct API sport keys the open bets could have a live game under -
  // racing has no live-score feed here (same as settlement), so it's skipped.
  const apiKeys = useMemo(() => {
    const set = new Set()
    for (const entry of openEntries ?? []) {
      for (const leg of entry.selections) {
        const sport = leg.sport ?? entry.sport
        if (sport === 'racing') continue
        for (const key of apiKeysForSport(sport)) set.add(key)
      }
    }
    return [...set].sort()
  }, [openEntries])

  const [byEvent, setByEvent] = useState(() => new Map())
  const keyParam = apiKeys.join(',')

  useEffect(() => {
    if (!keyParam) {
      setByEvent(new Map())
      return
    }
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(`/api/scores?state=live&keys=${encodeURIComponent(keyParam)}`)
        if (!res.ok) return
        const games = await res.json()
        if (cancelled || !Array.isArray(games)) return
        setByEvent(new Map(games.map((g) => [`${g.homeTeam} v ${g.awayTeam}`, g])))
      } catch {
        // Offline or a blip - keep whatever we last showed.
      }
    }
    load()
    const id = setInterval(load, REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [keyParam])

  return byEvent
}
