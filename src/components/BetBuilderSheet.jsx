import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import * as dataStore from '../lib/dataStore.js'

// Bottom sheet for Section 2A's "build a bet" flow: tap an odds cell,
// review the selection, optionally add a stake, then either post it to a
// group's feed or save it privately to the tracker. `selections` is kept
// as an array of one for now so multiples/bet-builder can slot in later
// without changing the bet_posts shape (see supabase/schema.sql).

export default function BetBuilderSheet({ selection, sport, onClose }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [groups, setGroups] = useState([])
  const [groupId, setGroupId] = useState('')
  const [stake, setStake] = useState('')
  const [stakeHidden, setStakeHidden] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    dataStore.listMyGroups(user.id).then((gs) => {
      setGroups(gs)
      if (gs.length) setGroupId(gs[0].id)
    })
  }, [user.id])

  const stakeNum = stake ? Number(stake) : null
  const potentialReturn = stakeNum ? Math.round(stakeNum * selection.odds * 100) / 100 : null

  async function handlePost() {
    setSubmitting(true)
    setError(null)
    try {
      const post = await dataStore.createBetPost({
        groupId,
        userId: user.id,
        sport,
        marketType: selection.market,
        selections: [selection],
        stake: stakeNum,
        stakeHidden,
        potentialReturn
      })
      onClose()
      navigate(`/groups/${groupId}`)
      return post
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
        marketType: selection.market,
        selections: [selection],
        stake: stakeNum,
        potentialReturn
      })
      onClose()
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
        <h2 className="sheet-title">Nice pick 👀</h2>

        <div className="selection-summary">
          <div className="selection-event">{selection.event}</div>
          <div className="selection-row">
            <span>{selection.market}</span>
            <span className="selection-pick">{selection.selection}</span>
          </div>
          <div className="selection-odds-row">
            <span className="selection-odds">{selection.odds.toFixed(2)}</span>
            <span className="selection-bookmaker">{selection.bookmaker}</span>
          </div>
        </div>

        <label className="field">
          <span>Stake (optional)</span>
          <input type="number" min="0" step="0.5" placeholder="£" value={stake} onChange={(e) => setStake(e.target.value)} />
        </label>

        {stakeNum > 0 && (
          <label className="field-check">
            <input type="checkbox" checked={stakeHidden} onChange={(e) => setStakeHidden(e.target.checked)} />
            <span>Hide stake amount from the group</span>
          </label>
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
          <button className="btn btn-secondary" onClick={handleSaveToTracker} disabled={submitting}>
            Keep it to myself
          </button>
          <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>
            Never mind
          </button>
        </div>

        {!groups.length && <p className="hint">Join or create a group first to share this one - head to the Social tab.</p>}
      </div>
    </div>
  )
}
