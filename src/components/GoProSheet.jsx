import { useEffect, useState } from 'react'
import * as dataStore from '../lib/dataStore.js'
import { computeStats } from '../utils/trackerStats.js'
import { tipsterBadge } from '../utils/tipsterBadge.js'
import Avatar from './Avatar.jsx'
import { useEscapeKey } from '../lib/useEscapeKey.js'
import { useDelayedClose } from '../lib/useDelayedClose.js'
import { TargetIcon, BadgeCheckIcon } from './icons/Icons.jsx'

const TIPSTER_BADGE_ICON = { sharp: TargetIcon, reliable: BadgeCheckIcon }

function StatTile({ label, value, tone }) {
  return (
    <div className={`stat-tile ${tone ? `tone-${tone}` : ''}`}>
      <div className="stat-tile-value">{value}</div>
      <div className="stat-tile-label">{label}</div>
    </div>
  )
}

// Which step a returning owner should land on - pure function of what's
// already saved, so there's no new gating state to keep in sync with
// GroupFeedPage.jsx's existing stripeConnectChargesEnabled/priceAmount
// checks. GroupFeedPage only ever opens this sheet when NOT both are set
// (see its own CTA condition), so "both set" isn't a case this needs to
// handle - that state renders the existing earnings block instead.
function resumeStep(group) {
  if (group?.priceAmount != null && !group?.stripeConnectChargesEnabled) return 'connect'
  return 'pitch'
}

// The "getting set up" half of turning a group into a paid one - a
// Patreon/OnlyFans/Substack-style pitch moment built around the owner's own
// track record, rather than the bare settings toggle this replaces. Three
// steps (Pitch -> Price -> Connect) using the exact same
// computeStats/tipsterBadge chain SocialFeedPage.jsx's Discover tab and
// JoinGroupPage.jsx's paywall already use, so all three surfaces agree on
// the same numbers. Once both stripeConnectChargesEnabled and priceAmount
// are true, GroupFeedPage.jsx stops opening this sheet at all - the
// existing earnings view (subscriber count, revenue, CSV export) takes
// over unchanged; this component only ever handles the "not fully set up
// yet" states.
export default function GoProSheet({
  group,
  user,
  onClose,
  priceInput,
  setPriceInput,
  savingPrice,
  handleSavePrice,
  connecting,
  connectError,
  handleConnectPayouts
}) {
  const { closing, requestClose } = useDelayedClose(onClose)
  useEscapeKey(requestClose)
  const [step, setStep] = useState(() => resumeStep(group))
  const [stats, setStats] = useState(null)
  const [followerCount, setFollowerCount] = useState(null)

  useEffect(() => {
    if (step !== 'pitch') return
    let cancelled = false
    dataStore.listBetPostsByUser(user.id).then((posts) => {
      if (cancelled) return
      setStats(computeStats(posts.filter((p) => p.visibility === 'public' && !p.stakeHidden)))
    })
    dataStore.getFollowerCount(user.id).then((c) => !cancelled && setFollowerCount(c))
    return () => {
      cancelled = true
    }
  }, [step, user.id])

  const badge = stats && tipsterBadge(stats)
  const BadgeIcon = badge && TIPSTER_BADGE_ICON[badge.icon]

  return (
    <div className={`sheet-backdrop${closing ? ' closing' : ''}`} onClick={requestClose}>
      <div className={`sheet${closing ? ' closing' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />

        {step === 'pitch' && (
          <div className="gopro-sheet-step">
            <h2 className="sheet-title">Turn your picks into income</h2>
            <div className="gopro-pitch-hero">
              <Avatar name={user.displayName} photoUrl={user.avatarUrl} size={56} />
              <span className="account-name">
                {user.displayName}
                {badge && (
                  <span className="chip chip--pill chip--sm chip--outline-accent tipster-badge icon-row">
                    {BadgeIcon && <BadgeIcon width={13} height={13} />} {badge.label}
                  </span>
                )}
              </span>
              {stats === null ? (
                <p className="hint">Loading your track record…</p>
              ) : (
                <div className="stat-tiles">
                  <StatTile label="Win rate" value={stats.winRate === null ? '-' : `${stats.winRate}%`} />
                  <StatTile
                    label="ROI"
                    value={stats.roi === null ? '-' : `${stats.roi >= 0 ? '+' : ''}${stats.roi}%`}
                    tone={stats.roi === null ? undefined : stats.roi >= 0 ? 'good' : 'bad'}
                  />
                  <StatTile label="Picks" value={stats.decidedCount} />
                  <StatTile label="Followers" value={followerCount ?? '-'} />
                </div>
              )}
              <p className="hint">You've got the track record. Time to get paid for it.</p>
            </div>
            <button className="btn btn-primary" onClick={() => setStep('price')}>
              Set your price
            </button>
            <button className="btn btn-ghost" onClick={requestClose}>
              Not now
            </button>
          </div>
        )}

        {step === 'price' && (
          <div className="gopro-sheet-step">
            <h2 className="sheet-title">Set your price</h2>
            <p className="hint">
              BetMates takes a 10% platform fee - the rest goes straight to you. Subscribers will see the exact track record
              you just saw before they pay.
            </p>
            <form className="chat-input-row" onSubmit={handleSavePrice}>
              <input
                type="number"
                min="0"
                step="0.5"
                placeholder="£ per month"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                required
              />
              <button className="btn btn-primary btn-small" type="submit" disabled={savingPrice}>
                {savingPrice ? 'Saving…' : 'Save'}
              </button>
            </form>
            {group?.priceAmount != null && (
              <button className="btn btn-primary" onClick={() => setStep('connect')}>
                Continue
              </button>
            )}
            <button className="btn btn-ghost" onClick={() => setStep('pitch')}>
              Back
            </button>
          </div>
        )}

        {step === 'connect' && (
          <div className="gopro-sheet-step">
            <h2 className="sheet-title">Connect payouts</h2>
            <p className="hint">
              Next, Stripe will ask for a few business/bank details so we can pay you directly - takes a few minutes. This
              happens on Stripe's own site, not BetMates.
            </p>
            <button className="btn btn-primary" onClick={handleConnectPayouts} disabled={connecting}>
              {connecting ? 'Redirecting…' : 'Continue to Stripe'}
            </button>
            {connectError && <p className="error">{connectError}</p>}
            <button className="btn btn-ghost" onClick={() => setStep('price')}>
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
