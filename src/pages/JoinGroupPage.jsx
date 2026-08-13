import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import * as dataStore from '../lib/dataStore.js'
import { startGroupCheckout } from '../api/groupBillingClient.js'

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
  const navigate = useNavigate()
  const [group, setGroup] = useState(null)
  const [showPaywall, setShowPaywall] = useState(false)
  const [error, setError] = useState(null)
  const [checkoutBusy, setCheckoutBusy] = useState(false)
  const [checkoutError, setCheckoutError] = useState(null)

  function joinAndEnter() {
    dataStore
      .joinGroupByCode(code, user.id)
      .then((joined) => navigate(`/groups/${joined.id}`, { replace: true }))
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
