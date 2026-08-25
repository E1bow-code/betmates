import { useEffect, useState } from 'react'
import { getPlayerProfile } from '../lib/playerProfile.js'
import { getFighterHistory } from '../lib/fighterHistory.js'
import { getFighterTaleOfTape } from '../lib/fighterTaleOfTape.js'
import { useEscapeKey } from '../lib/useEscapeKey.js'
import { useDelayedClose } from '../lib/useDelayedClose.js'
import { abbreviatePosition, flagFor, ageFrom } from '../utils/playerCard.js'
import TeamBadge from './TeamBadge.jsx'
import { ArrowUpRightIcon } from './icons/Icons.jsx'

// dateEvent from TheSportsDB is also a plain "YYYY-MM-DD" string - see
// formatBirthDate below for why this stays local instead of reusing
// src/utils/format.js.
function formatFightDate(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })
}

// dateBorn from TheSportsDB is a plain "YYYY-MM-DD" string, not a full ISO
// timestamp - src/utils/format.js's helpers all assume the latter, so this
// stays local rather than stretching a shared helper to fit one caller.
function formatBirthDate(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })
}

// Opened by tapping a fighter's name/photo (see FightDetailPage) - same
// sheet-backdrop/sheet shell as OddsAlertSheet, just showing whatever
// TheSportsDB has on that person as a trading-card front instead of a form.
// There's no real attribute-rating data (no free API has a FIFA-style
// 0-99 pace/shooting breakdown for a given player), so the card is built
// entirely from real fields TheSportsDB returns - position, nationality,
// physical stats, age - plus, for UFC specifically, reach/stance/division/
// record from ESPN's MMA API (TheSportsDB's generic lookup doesn't carry
// those) - rather than inventing numbers to fill a FUT-style stat wheel.
// Coverage varies a lot person to person, so every section below only
// renders if the field it needs actually came back.
export default function ParticipantProfileSheet({ name, sport, onClose }) {
  const [profile, setProfile] = useState(undefined)
  const [fights, setFights] = useState([])
  const [taleOfTape, setTaleOfTape] = useState(null)
  const { closing, requestClose } = useDelayedClose(onClose)
  useEscapeKey(requestClose)

  useEffect(() => {
    let cancelled = false
    setProfile(undefined)
    getPlayerProfile(name, sport).then((p) => {
      if (!cancelled) setProfile(p)
    })
    return () => {
      cancelled = true
    }
  }, [name, sport])

  // Boxing shares TheSportsDB's "Fighting" strSport with UFC, but the user
  // only asked for this on UFC cards - gated strictly to that rather than
  // profile.sport === 'Fighting' so boxing doesn't silently pick it up too.
  useEffect(() => {
    let cancelled = false
    setFights([])
    if (sport !== 'ufc') return undefined
    getFighterHistory(name).then((f) => {
      if (!cancelled) setFights(f)
    })
    return () => {
      cancelled = true
    }
  }, [name, sport])

  // Reach/stance/division/record - TheSportsDB's generic lookup above
  // doesn't carry MMA-specific fields, so this is a second source (ESPN,
  // see fighter-tale-of-tape.js), same UFC-only gate as the fight history.
  useEffect(() => {
    let cancelled = false
    setTaleOfTape(null)
    if (sport !== 'ufc') return undefined
    getFighterTaleOfTape(name).then((t) => {
      if (!cancelled) setTaleOfTape(t)
    })
    return () => {
      cancelled = true
    }
  }, [name, sport])

  const positionAbbr = profile ? abbreviatePosition(profile.position) : null
  const flag = profile ? flagFor(profile.nationality) : null
  const age = profile ? ageFrom(profile.dateBorn) : null
  // Football's strTeam is a real club; a combat sport's is a weight class
  // ("UFC Lightweight") - only the former gets a crest lookup.
  const isClub = profile?.sport === 'Soccer' && profile.team

  const statTiles = profile
    ? [
        profile.height && { label: 'Height', value: profile.height },
        profile.weight && { label: 'Weight', value: profile.weight },
        age !== null && { label: 'Age', value: String(age) },
        profile.status && { label: 'Status', value: profile.status, tone: profile.status === 'Active' ? 'good' : 'bad' },
        taleOfTape?.reach && { label: 'Reach', value: taleOfTape.reach },
        taleOfTape?.stance && { label: 'Stance', value: taleOfTape.stance },
        taleOfTape?.weightClass && { label: 'Division', value: taleOfTape.weightClass },
        taleOfTape?.record?.summary && { label: 'Record', value: taleOfTape.record.summary }
      ].filter(Boolean)
    : []

  const socials = profile
    ? [
        profile.twitter && { label: 'X / Twitter', href: profile.twitter },
        profile.instagram && { label: 'Instagram', href: profile.instagram },
        profile.facebook && { label: 'Facebook', href: profile.facebook }
      ].filter(Boolean)
    : []

  const hasNothing = profile && !profile.bio && statTiles.length === 0 && socials.length === 0 && !profile.photo

  return (
    <div className={`sheet-backdrop${closing ? ' closing' : ''}`} onClick={requestClose}>
      <div className={`sheet profile-sheet${closing ? ' closing' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        {profile === undefined && <div className="loading">Loading…</div>}
        {profile === null && (
          <>
            <h2 className="sheet-title">{name}</h2>
            <p className="hint">No extra profile data found for this name.</p>
          </>
        )}
        {profile && (
          <>
            <div className="player-card">
              <div className="player-card-top">
                {positionAbbr ? <span className="badge player-card-position">{positionAbbr}</span> : <span />}
                {profile.nationality && (
                  <span className="player-card-nation">
                    {flag && <span className="player-card-flag">{flag}</span>}
                    {profile.nationality}
                  </span>
                )}
              </div>

              <div className="player-card-photo-wrap">
                {profile.photo ? (
                  <img src={profile.photo} alt="" className="player-card-photo" loading="lazy" />
                ) : (
                  <span className="player-card-photo player-card-photo-fallback">{name.slice(0, 1)}</span>
                )}
              </div>

              <h2 className="player-card-name">{name}</h2>
              {profile.team && (
                <p className="player-card-subtitle">
                  {isClub && <TeamBadge team={profile.team} sport="football" size={16} />}
                  {profile.team}
                </p>
              )}
              {profile.dateBorn && (
                <p className="player-card-born">
                  Born {formatBirthDate(profile.dateBorn)}
                  {profile.birthLocation ? ` · ${profile.birthLocation}` : ''}
                </p>
              )}

              {statTiles.length > 0 && (
                <div className="stat-tiles player-card-stats">
                  {statTiles.map((t) => (
                    <div key={t.label} className={t.tone ? `stat-tile tone-${t.tone}` : 'stat-tile'}>
                      <div className="stat-tile-value">{t.value}</div>
                      <div className="stat-tile-label">{t.label}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {fights.length > 0 && (
              <div className="profile-sheet-fights">
                <h3 className="profile-sheet-fights-title">Last {fights.length} fight{fights.length === 1 ? '' : 's'}</h3>
                {fights.map((f, i) => (
                  <div key={i} className="fight-history-row">
                    <span className={`fight-history-result${f.result ? ` tone-${f.result === 'win' ? 'good' : 'bad'}` : ''}`}>
                      {f.result === 'win' ? 'W' : f.result === 'loss' ? 'L' : '–'}
                    </span>
                    <span className="fight-history-main">
                      <span className="fight-history-opponent">{f.opponent ? `vs ${f.opponent}` : f.event || 'Unknown event'}</span>
                      <span className="fight-history-meta">
                        {f.method || 'Method unknown'}
                        {f.date ? ` · ${formatFightDate(f.date)}` : ''}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}

            {profile.bio && <p className="profile-sheet-bio">{profile.bio}</p>}
            {socials.length > 0 && (
              <div className="profile-sheet-socials">
                {socials.map((s) => (
                  <a key={s.label} href={s.href} target="_blank" rel="noreferrer" className="btn btn-ghost icon-row">
                    {s.label} <ArrowUpRightIcon width={14} height={14} />
                  </a>
                ))}
              </div>
            )}
            {hasNothing && <p className="hint">No extra profile data found for this name.</p>}
          </>
        )}
        <div className="sheet-actions">
          <button className="btn btn-ghost" type="button" onClick={requestClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
