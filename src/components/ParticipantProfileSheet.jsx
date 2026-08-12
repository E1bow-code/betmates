import { useEffect, useState } from 'react'
import { getPlayerProfile } from '../lib/playerProfile.js'
import { useEscapeKey } from '../lib/useEscapeKey.js'
import { useDelayedClose } from '../lib/useDelayedClose.js'
import { abbreviatePosition, flagFor, ageFrom } from '../utils/playerCard.js'
import TeamBadge from './TeamBadge.jsx'

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
// physical stats, age - rather than inventing numbers to fill a FUT-style
// stat wheel. Coverage varies a lot person to person, so every section
// below only renders if the field it needs actually came back.
export default function ParticipantProfileSheet({ name, sport, onClose }) {
  const [profile, setProfile] = useState(undefined)
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
        profile.status && { label: 'Status', value: profile.status, tone: profile.status === 'Active' ? 'good' : 'bad' }
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

            {profile.bio && <p className="profile-sheet-bio">{profile.bio}</p>}
            {socials.length > 0 && (
              <div className="profile-sheet-socials">
                {socials.map((s) => (
                  <a key={s.label} href={s.href} target="_blank" rel="noreferrer" className="btn btn-ghost">
                    {s.label} ↗
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
