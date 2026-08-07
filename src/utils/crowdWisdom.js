// Crowd wisdom calibration: when your mates voted "Lock in" on a public
// pick (the public feed's three-way confidence vote - see BetCard.jsx's
// VOTE_OPTIONS), did it actually win more often than when they voted "Not
// happening"? A pure re-read of the vote tallies and the bet's own
// settlement outcome, both of which the app already stores - nobody has to
// rate anything new for this to exist.
const VOTE_KEYS = ['lock_in', 'not_sure', 'not_happening']
const MIN_SAMPLE = 3

// Turns raw bet_reactions rows (see dataStore.listReactions) into counts
// per vote key, ignoring emoji reactions from the group-post variant, which
// share the same table but aren't one of the three vote keys.
export function tallyVotes(reactions) {
  const counts = { lock_in: 0, not_sure: 0, not_happening: 0 }
  for (const r of reactions ?? []) {
    if (r.emoji in counts) counts[r.emoji]++
  }
  return counts
}

// posts: [{ status, votes: { lock_in, not_sure, not_happening } }]. A post
// counts toward whichever vote got the most votes; ties (including nobody
// having voted at all) are excluded - there's no clear crowd verdict to
// score the outcome against.
export function calibrateCrowdWisdom(posts) {
  const buckets = { lock_in: [], not_sure: [], not_happening: [] }
  for (const post of posts ?? []) {
    if (post.status !== 'won' && post.status !== 'lost') continue
    const counts = VOTE_KEYS.map((k) => post.votes?.[k] ?? 0)
    const max = Math.max(...counts)
    if (max === 0) continue
    const topKeys = VOTE_KEYS.filter((k, i) => counts[i] === max)
    if (topKeys.length !== 1) continue
    buckets[topKeys[0]].push(post.status === 'won')
  }

  return VOTE_KEYS.map((key) => {
    const results = buckets[key]
    if (results.length < MIN_SAMPLE) return null
    const wins = results.filter(Boolean).length
    return { key, winRate: Math.round((wins / results.length) * 100), sample: results.length }
  }).filter(Boolean)
}
