import { useEffect, useState } from 'react'
import * as dataStore from '../lib/dataStore.js'
import { calibrateCrowdWisdom, tallyVotes } from '../utils/crowdWisdom.js'

const VOTE_LABEL = { lock_in: 'Lock in', not_sure: 'Not sure', not_happening: 'Not happening' }

// Cross-references the public feed's three-way confidence vote (see
// BetCard.jsx's VOTE_OPTIONS) against what each pick actually did - are your
// mates' "Lock in" votes actually your best hit rate, or does the crowd call
// it wrong as often as right? Only this user's own public, settled posts -
// votes on someone else's pick aren't this person's track record.
export default function CrowdWisdomPanel({ userId }) {
  const [calibration, setCalibration] = useState(null)

  useEffect(() => {
    let cancelled = false
    dataStore.listBetPostsByUser(userId).then(async (posts) => {
      const settled = posts.filter((p) => p.visibility === 'public' && (p.status === 'won' || p.status === 'lost'))
      const withVotes = await Promise.all(
        settled.map(async (p) => ({ status: p.status, votes: tallyVotes(await dataStore.listReactions(p.id)) }))
      )
      if (!cancelled) setCalibration(calibrateCrowdWisdom(withVotes))
    })
    return () => {
      cancelled = true
    }
  }, [userId])

  if (!calibration || !calibration.length) return null

  return (
    <>
      <h3 className="market-title">Crowd wisdom</h3>
      <p className="hint">When your mates voted on a public pick, how often were they actually right?</p>
      <div className="tracker-list">
        {calibration.map((c) => (
          <div key={c.key} className="tracker-row icon-row">
            <span className="icon-row-badge">🗳️</span>
            <div className="tracker-row-main">
              <div className="selection-event">&quot;{VOTE_LABEL[c.key]}&quot;</div>
              <div className="race-card-meta">
                {c.winRate}% hit rate ({c.sample})
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
