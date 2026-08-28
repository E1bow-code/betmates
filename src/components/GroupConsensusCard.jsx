import { FlameIcon } from './icons/Icons.jsx'

// "What the group's on" - the picks 2+ members of this group are backing on
// open bets right now (computeGroupConsensus). Social proof that nudges a
// member to tail a selection their group already likes. Renders nothing when
// there's no consensus yet, so a quiet group never shows an empty card.
export default function GroupConsensusCard({ picks, memberNames, currentUserId }) {
  if (!picks || picks.length === 0) return null

  return (
    <div className="consensus-card">
      <h3 className="market-title icon-row consensus-title">
        <FlameIcon width={16} height={16} /> What the group&apos;s on
      </h3>
      <div className="consensus-list">
        {picks.map((p) => {
          const mine = p.backerIds.includes(currentUserId)
          return (
            <div key={`${p.event}|${p.market}|${p.selection}`} className="consensus-row">
              <div className="consensus-pick">
                <span className="consensus-sel">{p.selection}</span>
                <span className="consensus-event">{p.event}</span>
              </div>
              <span className="consensus-count">
                {p.count} {p.count === 1 ? 'mate' : 'mates'}
                {mine && <span className="consensus-you"> · incl. you</span>}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
