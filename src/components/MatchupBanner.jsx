import { useState } from 'react'
import PlayerPhoto from './PlayerPhoto.jsx'
import TeamBadge from './TeamBadge.jsx'
import SportIcon from './icons/SportIcons.jsx'
import ParticipantProfileSheet from './ParticipantProfileSheet.jsx'

// Card-level version of OddsListPage.jsx's inline .fixture-teams-row face-
// off (photo/badge + name either side of a "v") - same Photo/photoProp
// switch on participantType, sized up as its own header inside a bet-card
// ticket rather than sitting inline in a list row. Only rendered for
// single-leg bets with a resolvable two-sided matchup - see
// src/utils/matchup.js.
//
// `winner` (a name matching nameA/nameB, or null) drives the settled-result
// treatment: gold border + full opacity on the winner, dimmed on the loser,
// plus a W/L chip on each. Left null pre-settlement, on a void leg, or
// whenever resolveMatchupWinner can't be certain (see its own comment) -
// there's deliberately no "unknown" fallback state, since guessing wrong
// here would be worse than just not showing a result yet.
function Side({ Photo, photoProp, name, sport, winner, participantType, onTap }) {
  const resolved = winner != null
  const isWinner = winner === name
  const className = ['matchup-banner-side', resolved ? (isWinner ? 'matchup-banner-side-winner' : 'matchup-banner-side-loser') : '']
    .filter(Boolean)
    .join(' ')
  const photo = (
    <span className="matchup-banner-photo-wrap">
      <Photo {...{ [photoProp]: name }} sport={sport} size={64} />
      {resolved && <span className="matchup-banner-result-chip">{isWinner ? 'W' : 'L'}</span>}
    </span>
  )

  // ParticipantProfileSheet is TheSportsDB-player-backed only (see its own
  // file comment) - same participantType gate GenericEventDetailPage/
  // FightDetailPage already use before wrapping a name in
  // .fixture-team-profile-btn, so team badges here stay non-interactive too.
  return (
    <span className={className}>
      {participantType === 'player' ? (
        <button type="button" className="fixture-team-profile-btn matchup-banner-profile-btn" onClick={() => onTap(name)}>
          {photo}
          <span>{name}</span>
        </button>
      ) : (
        <>
          {photo}
          <span>{name}</span>
        </>
      )}
    </span>
  )
}

export default function MatchupBanner({ sport, nameA, nameB, participantType, winner = null }) {
  const Photo = participantType === 'player' ? PlayerPhoto : TeamBadge
  const photoProp = participantType === 'player' ? 'name' : 'team'
  const [profileTarget, setProfileTarget] = useState(null)

  return (
    <>
      <div className="matchup-banner">
        <Side
          Photo={Photo}
          photoProp={photoProp}
          name={nameA}
          sport={sport}
          winner={winner}
          participantType={participantType}
          onTap={setProfileTarget}
        />
        <span className="matchup-banner-vs">
          <SportIcon sport={sport} size={16} />
          VS
        </span>
        <Side
          Photo={Photo}
          photoProp={photoProp}
          name={nameB}
          sport={sport}
          winner={winner}
          participantType={participantType}
          onTap={setProfileTarget}
        />
      </div>
      {profileTarget && <ParticipantProfileSheet name={profileTarget} sport={sport} onClose={() => setProfileTarget(null)} />}
    </>
  )
}
