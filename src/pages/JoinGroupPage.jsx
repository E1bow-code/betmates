import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import * as dataStore from '../lib/dataStore.js'
import { startGroupCheckout } from '../api/groupBillingClient.js'
import { computeStats } from '../utils/trackerStats.js'
import { tipsterBadge } from '../utils/tipsterBadge.js'
import { TargetIcon, BadgeCheckIcon } from '../components/icons/Icons.jsx'

const TIPSTER_BADGE_ICON = { sharp: TargetIcon, reliable: BadgeCheckIcon }

// Landing spot for a shared invite link (see src/lib/share.js's
// groupInviteUrl) once the user is signed in. A free group joins and
// drops the user straight into it, same as before. A priced group
// (groups.price_amount) previews first via getGroupByCode - no insert -
// so an unsubscribed visitor sees a paywall instead of being joined
// unconditionally, and an already-subscribed one (or one returning from a
// successful Checkout, ?subscribed=1) still joins straight in.

export default function JoinGroupPage() {
  const { code } = useParams()
  const [searchParams] = useSearchParams()
  const returningFromCheckout = searchParams.get('subscribed') === '1'
  const { user } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [group, setGroup] = useState(null)
  const [showPaywall, setShowPaywall] = useState(false)
  const [error, setError] = useState(null)
  const [checkoutBusy, setCheckoutBusy] = useState(false)
  const [checkoutError, setCheckoutError] = useState(null)
  const [ownerStats, setOwnerStats] = useState(null)
  const [followerCount, setFollowerCount] = useState(null)

  // Same computeStats/tipsterBadge chain the Discover tab and GoProSheet's
  // pitch step already use, over the owner's own public settled bets - so
  // whoever's about to pay sees the exact track record that justified the
  // price, not just a bare number.
  useEffect(() => {
    if (!showPaywall || !group?.createdBy) return
    let cancelled = false
    dataStore.listBetPostsByUser(group.createdBy).then((posts) => {
      if (cancelled) return
      setOwnerStats(computeStats(posts.filter((p) => p.visibility === 'public' && !p.stakeHidden)))
    })
    dataStore.getFollowerCount(group.createdBy).then((c) => !cancelled && setFollowerCount(c))
    return () => {
      cancelled = true
    }
  }, [showPaywall, group?.createdBy])

  function joinAndEnter() {
    dataStore
      .joinGroupByCode(code, user.id)
      .then((joined) => {
        // A fast redirect can read as nothing having happened - this fires
        // right before the navigate, same as every other join/create flow
        // in the app (ManageSheet's create/join forms don't need one since
        // they stay on /groups and the new chip just appears, but landing
        // straight on the group's own page here has no other visible
        // "that worked" signal).
        showToast(`Joined ${joined.name}`)
        navigate(`/groups/${joined.id}`, { replace: true })
      })
      .catch((err) => setError(err.message))
  }

  // Preview + decide: free groups (or an already-active subscriber) join
  // straight in, same as the old unconditional behaviour. A priced group
  // with no active subscription shows the paywall instead. Returning from
  // Checkout is handled entirely by the retry effect below, to avoid this
  // one flashing the paywall while the webhook is still landing.
  useEffect(() => {
    if (returningFromCheckout) return
    let cancelled = false
    dataStore
      .getGroupByCode(code)
      .then(async (g) => {
        if (cancelled) return
        if (!g) {
          setError('No group found with that invite code.')
          return
        }
        setGroup(g)
        if (!g.priceAmount) {
          joinAndEnter()
          return
        }
        const sub = await dataStore.getGroupSubscription(g.id, user.id).catch(() => null)
        if (cancelled) return
        if (sub && (sub.status === 'active' || sub.status === 'trialing')) joinAndEnter()
        else setShowPaywall(true)
      })
      .catch((err) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [code, user.id, returningFromCheckout])

  // The webhook that grants access may not have landed by the time Stripe
  // redirects back - same "async webhook" handling AccountPage.jsx's Plus
  // upgrade flow already does, just retried a few times instead of once.
  useEffect(() => {
    if (!returningFromCheckout) return
    let cancelled = false
    let attempts = 0
    function attempt() {
      attempts += 1
      dataStore
        .joinGroupByCode(code, user.id)
        .then((joined) => {
          if (!cancelled) navigate(`/groups/${joined.id}`, { replace: true })
        })
        .catch(() => {
          if (cancelled) return
          if (attempts < 5) setTimeout(attempt, 1500)
          else setError("Payment received, but activating your membership is taking longer than expected - try opening the invite link again in a minute.")
        })
    }
    attempt()
    return () => {
      cancelled = true
    }
  }, [returningFromCheckout, code, user.id, navigate])

  async function handleSubscribe() {
    setCheckoutBusy(true)
    setCheckoutError(null)
    const accessToken = await dataStore.getAccessToken()
    const res = await startGroupCheckout({ accessToken, groupId: group.id })
    if (res.url) {
      window.location.href = res.url
      return
    }
    setCheckoutBusy(false)
    setCheckoutError(res.configured === false ? "Payments aren't set up yet - check back soon." : res.error || 'Something went wrong - try again.')
  }

  if (error) {
    return (
      <div>
        <div className="topbar">
          <h1>Couldn't join</h1>
        </div>
        <div className="error">{error}</div>
        <Link className="btn btn-secondary" to="/groups">
          Back to Social
        </Link>
      </div>
    )
  }

  if (returningFromCheckout) return <div className="loading">Activating your membership…</div>

  if (showPaywall && group) {
    return (
      <div>
        <div className="topbar">
          <h1>{group.name}</h1>
        </div>
        <div className="paywall-card">
          {ownerStats &&
            (() => {
              const badge = tipsterBadge(ownerStats)
              const BadgeIcon = badge && TIPSTER_BADGE_ICON[badge.icon]
              return (
                <div className="paywall-owner-pitch">
                  {badge && (
                    <span className="chip chip--pill chip--sm chip--outline-accent tipster-badge icon-row">
                      {BadgeIcon && <BadgeIcon width={13} height={13} />} {badge.label}
                    </span>
                  )}
                  <div className="stat-tiles">
                    <div className="stat-tile">
                      <div className="stat-tile-value">{ownerStats.winRate === null ? '-' : `${ownerStats.winRate}%`}</div>
                      <div className="stat-tile-label">Win rate</div>
                    </div>
                    <div className={`stat-tile ${ownerStats.roi === null ? '' : ownerStats.roi >= 0 ? 'tone-good' : 'tone-bad'}`}>
                      <div className="stat-tile-value">
                        {ownerStats.roi === null ? '-' : `${ownerStats.roi >= 0 ? '+' : ''}${ownerStats.roi}%`}
                      </div>
                      <div className="stat-tile-label">ROI</div>
                    </div>
                    <div className="stat-tile">
                      <div className="stat-tile-value">{ownerStats.decidedCount}</div>
                      <div className="stat-tile-label">Picks</div>
                    </div>
                  </div>
                  {followerCount !== null && (
                    <p className="hint">
                      {followerCount} follower{followerCount === 1 ? '' : 's'}
                    </p>
                  )}
                </div>
              )
            })()}
          <p>
            This is a paid group - £{Number(group.priceAmount).toFixed(2)}/month for access to its picks and chat.
          </p>
          <p className="hint">
            BetMates never guarantees results - this is access to the group's picks and community, not a promise of profit.
          </p>
          <button className="btn btn-primary" onClick={handleSubscribe} disabled={checkoutBusy}>
            {checkoutBusy ? 'Redirecting…' : `Subscribe · £${Number(group.priceAmount).toFixed(2)}/month`}
          </button>
          {checkoutError && <p className="error">{checkoutError}</p>}
          <Link className="btn btn-ghost" to="/groups">
            Not now
          </Link>
        </div>
      </div>
    )
  }

  return <div className="loading">Joining the group…</div>
}
