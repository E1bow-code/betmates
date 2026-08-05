import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useBetSlip } from '../context/BetSlipContext.jsx'
import { useOddsFormat } from '../context/OddsFormatContext.jsx'
import * as dataStore from '../lib/dataStore.js'
import { notifyGroup } from '../lib/notify.js'
import { formatOdds } from '../utils/oddsFormat.js'
import { periodStart, sumStakesSince } from '../utils/spendLimit.js'
import { getEachWayTerms, computeEachWayReturn } from '../utils/eachWay.js'

// The bet slip: reads its legs from BetSlipContext rather than a single
// `selection` prop, so tapping outcomes across different fixtures builds
// one accumulator instead of always overwriting a single pick. A one-leg
// slip is just the simple "share this bet" flow from before; more legs
// makes it a real bet builder, with combined odds = the product of each
// leg's price (standard accumulator math).

export default function BetBuilderSheet() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { legs, removeLeg, clearSlip, sheetOpen, closeSheet } = useBetSlip()
  const { format } = useOddsFormat()
  const [groups, setGroups] = useState([])
  const [groupId, setGroupId] = useState('')
  const [stake, setStake] = useState('')
  const [stakeHidden, setStakeHidden] = useState(false)
  const [eachWay, setEachWay] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [periodSpend, setPeriodSpend] = useState(null)

  useEffect(() => {
    dataStore.listMyGroups(user.id).then((gs) => {
      setGroups(gs)
      if (gs.length) setGroupId(gs[0].id)
    })
  }, [user.id])

  // Only fetched when the user actually has a limit set - a soft,
  // non-blocking heads-up before they post/save, not a hard stop (the app
  // never places bets, so it has no way to actually prevent one).
  useEffect(() => {
    if (!user.stakeLimitAmount) return
    Promise.all([dataStore.listBetPostsByUser(user.id), dataStore.listManualEntries(user.id)]).then(([posted, manual]) => {
      setPeriodSpend(sumStakesSince([...posted, ...manual], periodStart(user.stakeLimitPeriod)))
    })
  }, [user.id, user.stakeLimitAmount, user.stakeLimitPeriod])

  if (!sheetOpen || !legs.length) return null

  const combinedOdds = legs.reduce((acc, leg) => acc * leg.odds, 1)
  const stakeNum = stake ? Number(stake) : null
  // Each-way only makes sense for a single racing pick - real books don't
  // offer it on multi-leg accumulators, and combining it with other sports'
  // legs has no defined payout rule.
  const eachWayTerms = legs.length === 1 && legs[0].sport === 'racing' ? getEachWayTerms(legs[0].runnerCount) : null
  const applyEachWay = eachWay && eachWayTerms
  const potentialReturn = stakeNum
    ? applyEachWay
      ? Math.round(computeEachWayReturn(stakeNum, combinedOdds, eachWayTerms, 'win') * 100) / 100
      : Math.round(stakeNum * combinedOdds * 100) / 100
    : null
  const marketType = legs.length > 1 ? `${legs.length}-leg Bet Builder` : applyEachWay ? 'Each-way' : legs[0].market
  const sport = legs.every((leg) => leg.sport === legs[0].sport) ? legs[0].sport : 'multi'
  const submittedLegs = applyEachWay
    ? [{ ...legs[0], market: 'Each-way', eachWay: true, eachWayFraction: eachWayTerms.fraction, eachWayPlaces: eachWayTerms.places }]
    : legs

  function onClose() {
    if (!submitting) closeSheet()
  }

  async function handlePost() {
    setSubmitting(true)
    setError(null)
    try {
      const post = await dataStore.createBetPost({
        groupId,
        userId: user.id,
        sport,
        marketType,
        selections: submittedLegs,
        stake: stakeNum,
        stakeHidden,
        potentialReturn,
        visibility: 'group'
      })
      const groupName = groups.find((g) => g.id === groupId)?.name ?? 'your group'
      notifyGroup(
        groupId,
        {
          title: `${user.displayName} posted a bet in ${groupName}`,
          body: `${legs[0].event} - ${legs[0].market}: ${legs[0].selection}${legs.length > 1 ? ` +${legs.length - 1} more` : ''}`,
          url: `/#/groups/${groupId}`
        },
        user.id
      )
      clearSlip()
      navigate(`/groups/${groupId}`)
      return post
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handlePostPublic() {
    setSubmitting(true)
    setError(null)
    try {
      await dataStore.createBetPost({
        groupId: null,
        userId: user.id,
        sport,
        marketType,
        selections: submittedLegs,
        stake: stakeNum,
        stakeHidden,
        potentialReturn,
        visibility: 'public'
      })
      clearSlip()
      navigate('/groups', { state: { segment: 'feed' } })
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSaveToTracker() {
    setSubmitting(true)
    setError(null)
    try {
      await dataStore.addManualEntry({
        userId: user.id,
        sport,
        marketType,
        selections: submittedLegs,
        stake: stakeNum,
        potentialReturn
      })
      clearSlip()
      navigate('/tracker')
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <h2 className="sheet-title">{legs.length > 1 ? `Your bet builder (${legs.length} legs)` : 'Your pick'}</h2>

        <div className="bet-slip-legs">
          {legs.map((leg) => (
            <div key={`${leg.event}|${leg.market}|${leg.selection}`} className="selection-summary bet-slip-leg">
              <button className="bet-slip-leg-remove" onClick={() => removeLeg(leg)} aria-label="Remove leg">
                &times;
              </button>
              <div className="selection-event">{leg.event}</div>
              <div className="selection-row">
                <span>{leg.market}</span>
                <span className="selection-pick">{leg.selection}</span>
              </div>
              <div className="selection-odds-row">
                <span className="selection-odds">{formatOdds(leg.odds, format)}</span>
                <span className="selection-bookmaker">{leg.bookmaker}</span>
              </div>
            </div>
          ))}
        </div>

        {legs.length > 1 && (
          <div className="potential-return">
            Combined odds: <strong>{formatOdds(combinedOdds, format)}</strong>
          </div>
        )}

        <label className="field">
          <span>Stake (optional)</span>
          <input type="number" min="0" step="0.5" placeholder="£" value={stake} onChange={(e) => setStake(e.target.value)} />
        </label>
        {!stakeNum && groups.length > 0 && <p className="hint">No stake - this posts as a free pick and counts toward this week's Pick'em leaderboard.</p>}

        {eachWayTerms && (
          <>
            <label className="field-check">
              <input type="checkbox" checked={eachWay} onChange={(e) => setEachWay(e.target.checked)} />
              <span>Each-way (win + place)</span>
            </label>
            {eachWay && (
              <p className="hint">
                Terms: {eachWayTerms.fraction === 0.25 ? '1/4' : '1/5'} odds, {eachWayTerms.places} places. Half your stake rides on
                each part.
              </p>
            )}
          </>
        )}

        {stakeNum > 0 && (
          <label className="field-check">
            <input type="checkbox" checked={stakeHidden} onChange={(e) => setStakeHidden(e.target.checked)} />
            <span>Hide stake amount from the group</span>
          </label>
        )}

        {user.stakeLimitAmount && periodSpend !== null && stakeNum > 0 && periodSpend + stakeNum > user.stakeLimitAmount && (
          <div className="limit-warning">
            ⚠️ This would take you to £{(periodSpend + stakeNum).toFixed(2)} of your £{Number(user.stakeLimitAmount).toFixed(2)}{' '}
            {user.stakeLimitPeriod === 'monthly' ? 'monthly' : 'weekly'} limit.
          </div>
        )}

        {potentialReturn && (
          <div className="potential-return">
            Potential return: <strong>£{potentialReturn.toFixed(2)}</strong>
          </div>
        )}

        {groups.length > 0 && (
          <label className="field">
            <span>Post to group</span>
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {error && <div className="auth-error">{error}</div>}

        <div className="sheet-actions">
          {groups.length > 0 && (
            <button className="btn btn-primary" onClick={handlePost} disabled={submitting}>
              {submitting ? 'Posting…' : 'Share with the group'}
            </button>
          )}
          <button className="btn btn-secondary" onClick={handlePostPublic} disabled={submitting}>
            {submitting ? 'Posting…' : 'Post to everyone'}
          </button>
          <button className="btn btn-secondary" onClick={handleSaveToTracker} disabled={submitting}>
            Keep it to myself
          </button>
          <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>
            Keep adding picks
          </button>
        </div>

        {!groups.length && <p className="hint">Tip: join or create a group to share with just your mates instead of everyone.</p>}
      </div>
    </div>
  )
}
