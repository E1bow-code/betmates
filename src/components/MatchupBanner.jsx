import PlayerPhoto from './PlayerPhoto.jsx'
import TeamBadge from './TeamBadge.jsx'
import SportIcon from './icons/SportIcons.jsx'

// Card-level version of OddsListPage.jsx's inline .fixture-teams-row face-
// off (photo/badge + name either side of a "v") - same Photo/photoProp
// switch on participantType, just bigger and boxed as its own banner
// rather than sitting in a list row. Only rendered for single-leg bets
// with a resolvable two-sided matchup - see src/utils/matchup.js.
export default function MatchupBanner({ sport, nameA, nameB, participantType }) {
  const Photo = participantType === 'player' ? PlayerPhoto : TeamBadge
  const photoProp = participantType === 'player' ? 'name' : 'team'

  return (
    <div className="matchup-banner">
      <span className="matchup-banner-side">
        <Photo {...{ [photoProp]: nameA }} sport={sport} size={44} />
        <span>{nameA}</span>
      </span>
      <span className="matchup-banner-vs">
        <SportIcon sport={sport} size={16} />
        VS
      </span>
      <span className="matchup-banner-side">
        <Photo {...{ [photoProp]: nameB }} sport={sport} size={44} />
        <span>{nameB}</span>
      </span>
    </div>
  )
}
