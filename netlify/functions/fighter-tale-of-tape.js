// Reach, stance, weight class, and win/loss-by-method record for a UFC
// fighter - the "tale of the tape" fields TheSportsDB's generic athlete
// lookup (src/lib/playerProfile.js, which already covers height/weight/
// nationality/bio for every sport) simply doesn't carry, since it isn't
// MMA-specific. ESPN's public MMA API has all of it, free and unauthed,
// so this is a second, narrower proxy rather than stretching playerProfile
// to fit - UFCStats.com itself was the obvious first choice but runs an
// active JS proof-of-work challenge a server-side fetch can't pass.
//
// ESPN's own athlete-search endpoint has no name-only filter, so this
// walks three calls: search by name -> pull the athlete id out of the
// result's uid ("s:3301~a:<id>") -> the athlete detail resource (reach/
// stance/weightClass) -> its records sub-resource (win-loss-draw plus a
// method breakdown). Cached like fighter-history.js for the same reasons.
import { cacheGet, cacheSet } from '../../src/lib/apiCache.js'

const HIT_TTL = 24 * 60 * 60 * 1000
const MISS_TTL = 60 * 60 * 1000
const FAILURE_TTL = 5 * 60 * 1000

function json(data, source) {
  const headers = { 'content-type': 'application/json' }
  if (source) headers['x-data-source'] = source
  return new Response(JSON.stringify(data), { status: 200, headers })
}

function statValue(stats, name) {
  return stats?.find((s) => s.name === name)?.value ?? null
}

export default async (req) => {
  const params = new URL(req.url).searchParams
  const name = params.get('name')
  if (!name) return json(null)

  const key = `fighter-tot-${name.toLowerCase()}`
  const cached = cacheGet(key)
  if (cached !== undefined) return json(cached, 'live-cached')

  try {
    const searchRes = await fetch(`https://site.web.api.espn.com/apis/search/v2?query=${encodeURIComponent(name)}&limit=5`)
    if (!searchRes.ok) throw new Error(`ESPN search: ${searchRes.status}`)
    const searchData = await searchRes.json()
    const playerGroup = searchData?.results?.find((r) => r.type === 'player')
    const match = playerGroup?.contents?.find((c) => c.sport === 'mma')
    const athleteId = match?.uid?.split('~a:')[1]
    if (!athleteId) {
      cacheSet(key, null, MISS_TTL)
      return json(null, 'live')
    }

    const detailRes = await fetch(`https://sports.core.api.espn.com/v2/sports/mma/leagues/ufc/athletes/${athleteId}`)
    if (!detailRes.ok) throw new Error(`ESPN athlete: ${detailRes.status}`)
    const detail = await detailRes.json()

    // The record breakdown is a nice-to-have, not the headline data - a
    // fighter with reach/stance but a records lookup that fails (a
    // free-agent between orgs, an ESPN data gap) still gets a tale-of-
    // the-tape card, just without the W-L-D line.
    let record = null
    try {
      const recordsRes = await fetch(detail.records?.$ref)
      if (recordsRes.ok) {
        const recordsData = await recordsRes.json()
        const totalRes = await fetch(recordsData?.items?.[0]?.$ref)
        if (totalRes.ok) {
          const total = await totalRes.json()
          record = {
            summary: total.displayValue ?? null,
            wins: statValue(total.stats, 'wins'),
            losses: statValue(total.stats, 'losses'),
            draws: statValue(total.stats, 'draws'),
            submissions: statValue(total.stats, 'submissions'),
            tkos: statValue(total.stats, 'tkos'),
            titleWins: statValue(total.stats, 'titleWins')
          }
        }
      }
    } catch {
      // Swallowed - see comment above.
    }

    const result = {
      reach: detail.displayReach ?? null,
      stance: detail.stance?.text ?? null,
      weightClass: detail.weightClass?.text ?? null,
      record
    }

    cacheSet(key, result, HIT_TTL)
    return json(result, 'live')
  } catch (err) {
    console.error(`fighter-tale-of-tape lookup failed for "${name}":`, err.message)
    cacheSet(key, null, FAILURE_TTL)
    return json(null)
  }
}
