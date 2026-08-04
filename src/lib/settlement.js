// Client-triggered instant check, called from TrackerPage on load - gives
// whoever's actually looking an up-to-the-minute result instead of waiting
// for the next scheduled run. netlify/functions/auto-settle.js covers the
// passive case (nobody has to open the app for a bet to stop saying
// "pending"), sharing the same evaluation rules from betEvaluation.js so the
// two never disagree on what counts as settled.
import * as dataStore from './dataStore.js'
import { apiKeysForSport } from './sportsConfig.js'
import { evaluateEntry } from './betEvaluation.js'

async function fetchScores(apiSportKeys) {
  if (!apiSportKeys.length) return []
  const res = await fetch(`/api/scores?keys=${encodeURIComponent(apiSportKeys.join(','))}`)
  if (!res.ok) return []
  return res.json()
}

export async function checkAndSettleBets(userId) {
  const [posts, manual] = await Promise.all([dataStore.listBetPostsByUser(userId), dataStore.listManualEntries(userId)])
  const open = [
    ...posts.filter((p) => p.status === 'open').map((p) => ({ ...p, source: 'post' })),
    ...manual.filter((m) => m.status === 'open').map((m) => ({ ...m, source: 'manual' }))
  ]
  if (!open.length) return { settled: 0 }

  const neededKeys = new Set()
  for (const entry of open) {
    for (const leg of entry.selections) {
      for (const key of apiKeysForSport(leg.sport ?? entry.sport)) neededKeys.add(key)
    }
  }
  if (!neededKeys.size) return { settled: 0 }

  const games = await fetchScores([...neededKeys])
  if (!games.length) return { settled: 0 }

  let settled = 0
  await Promise.all(
    open.map(async (entry) => {
      const status = evaluateEntry(entry, games)
      if (!status) return
      if (entry.source === 'post') await dataStore.updateBetStatus(entry.id, status)
      else await dataStore.updateManualEntryStatus(entry.id, status)
      settled++
    })
  )
  return { settled }
}
