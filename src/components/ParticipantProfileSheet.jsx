import { useEffect, useState } from 'react'
import { getPlayerProfile } from '../lib/playerProfile.js'

// dateBorn from TheSportsDB is a plain "YYYY-MM-DD" string, not a full ISO
// timestamp - src/utils/format.js's helpers all assume the latter, so this
// stays local rather than stretching a shared helper to fit one caller.
function formatBirthDate(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })
}

// Opened by tapping a fighter's name/photo (see FightDetailPage) - same
// sheet-backdrop/sheet shell as OddsAlertSheet, just showing whatever
// TheSportsDB has on that person instead of a form. Coverage varies a lot
// person to person, so every section below only renders if the field it
// needs actually came back.
export default function ParticipantProfileSheet({ name, onClose }) {
  const [profile, setProfile] = useState(undefined)

  useEffect(() => {
    let cancelled = false
    setProfile(undefined)
    getPlayerProfile(name).then((p) => {
      if (!cancelled) setProfile(p)
    })
    return () => {
      cancelled = true
    }
  }, [name])

  const facts = profile
    ? [
        profile.status && { label: 'Status', value: profile.status },
        profile.nationality && { label: 'Nationality', value: profile.nationality },
        profile.dateBorn && { label: 'Born', value: formatBirthDate(profile.dateBorn) },
        profile.birthLocation && { label: 'Birthplace', value: profile.birthLocation },
        profile.height && { label: 'Height', value: profile.height },
        profile.weight && { label: 'Weight', value: profile.weight }
      ].filter(Boolean)
    : []

  const socials = profile
    ? [
        profile.twitter && { label: 'X / Twitter', href: profile.twitter },
        profile.instagram && { label: 'Instagram', href: profile.instagram },
        profile.facebook && { label: 'Facebook', href: profile.facebook }
      ].filter(Boolean)
    : []

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet profile-sheet" onClick={(e) => e.stopPropagation()}>
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
            <div className="profile-sheet-header">
              {profile.photo ? (
                <img src={profile.photo} alt="" className="profile-sheet-photo" loading="lazy" />
              ) : (
                <span className="profile-sheet-photo profile-sheet-photo-fallback">{name.slice(0, 1)}</span>
              )}
              <div>
                <h2 className="sheet-title">{name}</h2>
                {facts.length > 0 && (
                  <div className="profile-sheet-facts">
                    {facts.map((f) => (
                      <span key={f.label} className="profile-sheet-fact">
                        <span className="profile-sheet-fact-label">{f.label}</span> {f.value}
                      </span>
                    ))}
                  </div>
                )}
              </div>
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
            {!profile.bio && facts.length === 0 && socials.length === 0 && (
              <p className="hint">No extra profile data found for this name.</p>
            )}
          </>
        )}
        <div className="sheet-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
