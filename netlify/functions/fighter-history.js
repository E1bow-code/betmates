// A UFC/boxing fighter's last 3 results (win/loss, opponent, method of
// victory) for the "Last 3 fights" section on ParticipantProfileSheet.
// TheSportsDB spreads this across three calls: searchplayers.php for the
// id, playerresults.php for the results themselves (already sorted
// most-recent-first, but with no opponent or method), and lookupevent.php
// per fight for strResult, a newline-per-bout / tab-per-field string that
// has to be parsed to find the target fighter's own line. Proxied and
// cached for the same CORS/rate-limit reasons as player-photo.js.
import { cacheGet, cacheSet } from '../../src/lib/apiCache.js'

const HIT_TTL = 24 * 60 * 60 * 1000
const MISS_TTL = 60 * 60 * 1000
const FAILURE_TTL = 5 * 60 * 1000

function json(fights, source) {
  const headers = { 'content-type': 'application/json' }
  if (source) headers['x-data-source'] = source
  return new Response(JSON.stringify({ fights }), { status: 200, headers })
}

// Same reasoning as fighter-tale-of-tape.js's identical helper: a cache
// miss here means a sequential search->results chain plus up to 3
// parallel lookupevent.php calls, none of which had a bound - one
// hanging TheSportsDB response stalled the whole request for as long as
// the platform's own function timeout allows, blocking the profile
// sheet's open animation the whole time.
const FETCH_TIMEOUT_MS = 6000
function fetchWithTimeout(url) {
  return fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
}

// A champion's name in strResult carries a trailing "(c)" ("Islam
// Makhachev (c)") that isn't part of strPlayer, so a straight equality
// check against fighterName misses and both sides get treated as "not the
// fighter" - confirmed live where this silently listed a fighter as their
// own opponent in title-defense results. Comparisons match on the name
// with any trailing parenthetical stripped; the opponent is still
// returned with its own tag intact for display.
function stripTag(s) {
  return (s || '').replace(/\s*\([^)]*\)\s*$/, '').trim()
}

// strResult is one line per bout on the card, but TheSportsDB has used two
// different layouts across the years for it (confirmed live against both
// an old and a recent event) - find the target fighter's own line
// (playerresults.php doesn't say which side they were on) and pull
// whichever of winner/loser isn't them, plus the method, from whichever
// shape it turns out to be:
//   old:   "WeightClass\tWinner\tdef.\tLoser\tMethod (detail)\tRound\tTime"
//   newer: "[Label: ]Winner def. Loser by Method (detail) - Round N, Time"
function parseResult(strResult, fighterName) {
  if (!strResult) return { opponent: null, method: null }
  const line = strResult.split(/\r?\n/).find((l) => l.includes(fighterName) && l.includes('def.'))
  if (!line) return { opponent: null, method: null }

  let winner, loser, method
  if (line.includes('\t')) {
    const parts = line.split('\t').map((p) => p.trim()).filter(Boolean)
    const defIdx = parts.indexOf('def.')
    if (defIdx < 1) return { opponent: null, method: null }
    winner = parts[defIdx - 1]
    loser = parts[defIdx + 1]
    method = parts[defIdx + 2] || null
  } else {
    const [beforeDef, afterDef] = line.split(' def. ')
    if (!beforeDef || !afterDef) return { opponent: null, method: null }
    winner = (beforeDef.includes(':') ? beforeDef.split(':').pop() : beforeDef).trim()
    const byIdx = afterDef.indexOf(' by ')
    loser = (byIdx === -1 ? afterDef : afterDef.slice(0, byIdx)).trim()
    method = byIdx === -1 ? null : afterDef.slice(byIdx + 4).trim()
    if (method) {
      const roundIdx = method.search(/ - Round/)
      if (roundIdx !== -1) method = method.slice(0, roundIdx).trim()
    }
  }

  if (!winner || !loser) return { opponent: null, method }
  if (stripTag(winner) === fighterName) return { opponent: loser, method }
  if (stripTag(loser) === fighterName) return { opponent: winner, method }
  return { opponent: null, method }
}

export default async (req) => {
  const params = new URL(req.url).searchParams
  const name = params.get('name')
  if (!name) return json([])

  const key = `fighter-history-${name.toLowerCase()}`
  const cached = cacheGet(key)
  if (cached !== undefined) return json(cached, 'live-cached')

  const apiKey = process.env.SPORTSDB_API_KEY || '3'
  try {
    const searchRes = await fetchWithTimeout(`https://www.thesportsdb.com/api/v1/json/${apiKey}/searchplayers.php?p=${encodeURIComponent(name)}`)
    if (!searchRes.ok) throw new Error(`TheSportsDB search: ${searchRes.status}`)
    const searchData = await searchRes.json()
    const fighter = searchData?.player?.find((p) => p.strSport === 'Fighting')
    if (!fighter) {
      cacheSet(key, [], MISS_TTL)
      return json([], 'live')
    }

    const resultsRes = await fetchWithTimeout(`https://www.thesportsdb.com/api/v1/json/${apiKey}/playerresults.php?id=${fighter.idPlayer}`)
    if (!resultsRes.ok) throw new Error(`TheSportsDB results: ${resultsRes.status}`)
    const resultsData = await resultsRes.json()
    const recent = (resultsData?.results ?? []).slice(0, 3)

    const fights = await Promise.all(
      recent.map(async (r) => {
        const base = {
          event: r.strEvent || null,
          date: r.dateEvent || null,
          result: r.strDetail === 'WIN' ? 'win' : r.strDetail === 'LOSS' ? 'loss' : null,
          opponent: null,
          method: null
        }
        if (!r.idEvent) return base
        try {
          const eventRes = await fetchWithTimeout(`https://www.thesportsdb.com/api/v1/json/${apiKey}/lookupevent.php?id=${r.idEvent}`)
          if (!eventRes.ok) return base
          const eventData = await eventRes.json()
          const { opponent, method } = parseResult(eventData?.events?.[0]?.strResult, fighter.strPlayer)
          return { ...base, opponent, method }
        } catch {
          return base
        }
      })
    )

    cacheSet(key, fights, fights.length ? HIT_TTL : MISS_TTL)
    return json(fights, 'live')
  } catch (err) {
    console.error(`fighter-history lookup failed for "${name}":`, err.message)
    cacheSet(key, [], FAILURE_TTL)
    return json([])
  }
}
