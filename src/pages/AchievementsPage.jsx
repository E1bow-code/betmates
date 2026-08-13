import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import * as dataStore from '../lib/dataStore.js'
import { computeAchievements } from '../utils/achievements.js'
import { REFERRAL_TIERS } from '../utils/referralRewards.js'
import SportHeroBanner from '../components/SportHeroBanner.jsx'
import {
  TargetIcon,
  BookIcon,
  MoneyIcon,
  FlameIcon,
  BadgeCheckIcon,
  TrophyIcon,
  GlobeIcon,
  DiamondIcon,
  HorseIcon,
  HandshakeIcon,
  MegaphoneIcon,
  CrownIcon
} from '../components/icons/Icons.jsx'

const ICON = {
  target: TargetIcon,
  book: BookIcon,
  money: MoneyIcon,
  flame: FlameIcon,
  perfect: BadgeCheckIcon,
  trophy: TrophyIcon,
  globe: GlobeIcon,
  diamond: DiamondIcon,
  horse: HorseIcon,
  handshake: HandshakeIcon,
  megaphone: MegaphoneIcon,
  crown: CrownIcon
}

export default function AchievementsPage() {
  const { user } = useAuth()
  const [entries, setEntries] = useState(null)
  const [referralCount, setReferralCount] = useState(null)

  useEffect(() => {
    Promise.all([dataStore.listBetPostsByUser(user.id), dataStore.listManualEntries(user.id)]).then(([posted, manual]) => {
      setEntries([...posted, ...manual])
    })
    dataStore.countReferrals(user.id).then(setReferralCount).catch(() => setReferralCount(0))
  }, [user.id])

  if (entries === null) return <div className="loading">Tallying up your achievements…</div>

  const achievements = computeAchievements(entries)
  const earnedCount = achievements.filter((a) => a.earned).length

  return (
    <div>
      <SportHeroBanner sport="achievements" />
      <div className="topbar">
        <Link to="/tracker" className="back">
          &larr; Tracker
        </Link>
        <h1>Achievements</h1>
        <p className="race-card-meta">
          {earnedCount} of {achievements.length} unlocked
        </p>
        <div
          className="limit-progress-track"
          role="progressbar"
          aria-label="Achievements unlocked"
          aria-valuenow={earnedCount}
          aria-valuemin={0}
          aria-valuemax={achievements.length}
        >
          <div
            className="limit-progress-fill tone-good"
            style={{ width: `${achievements.length ? (earnedCount / achievements.length) * 100 : 0}%` }}
          />
        </div>
      </div>

      <div className="achievements-grid">
        {achievements.map((a) => {
          const Icon = ICON[a.icon]
          return (
            <div key={a.id} className={a.earned ? 'achievement-card earned' : 'achievement-card'}>
              <div className="achievement-icon">{Icon && <Icon width={22} height={22} />}</div>
              <div className="achievement-label">{a.label}</div>
              <div className="achievement-hint">{a.earned ? 'Unlocked' : a.hint}</div>
            </div>
          )
        })}
      </div>

      <h2 className="market-title achievements-subhead">Referral rewards</h2>
      <p className="race-card-meta">Unlock a new title for every mate who joins from your invite link (Account &rarr; Invite your mates).</p>
      <div className="achievements-grid">
        {REFERRAL_TIERS.map((tier) => {
          const earned = referralCount !== null && referralCount >= tier.threshold
          const remaining = referralCount === null ? tier.threshold : tier.threshold - referralCount
          const Icon = ICON[tier.icon]
          return (
            <div key={tier.threshold} className={earned ? 'achievement-card earned' : 'achievement-card'}>
              <div className="achievement-icon">{Icon && <Icon width={22} height={22} />}</div>
              <div className="achievement-label">{tier.label}</div>
              <div className="achievement-hint">
                {earned
                  ? 'Unlocked'
                  : `Invite ${tier.threshold} ${tier.threshold === 1 ? 'mate' : 'mates'}${
                      referralCount ? ` (${remaining} to go)` : ''
                    }`}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
