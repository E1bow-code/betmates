import { useState } from 'react'
import * as dataStore from '../lib/dataStore.js'
import { computeEachWayReturn } from '../utils/eachWay.js'
import { useEscapeKey } from '../lib/useEscapeKey.js'
import { useDelayedClose } from '../lib/useDelayedClose.js'
import { useToast } from '../context/ToastContext.jsx'
import { backdropDismissProps } from '../lib/sheetDismiss.js'

// Fixes a mis-typed stake, or gives up on a bet entirely - only ever shown
// for the author's own bets while still open (see BetCard.jsx/TrackerPage.jsx
// for the gating, and supabase/schema.sql for the same rule enforced
// server-side). Selections/odds/market are deliberately not editable here:
// those are a record of what was actually picked at the time, not
// something to revise after the fact.
export default function EditBetSheet({ entry, onClose, onUpdated, onDeleted }) {
  const { showToast } = useToast()
  const [stake, setStake] = useState(String(entry.stake ?? ''))
  const [stakeHidden, setStakeHidden] = useState(Boolean(entry.stakeHidden))
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState(null)
  const { closing, requestClose } = useDelayedClose(onClose)
  useEscapeKey(requestClose, !saving && !deleting)

  const isGroupPost = entry.source === 'group'
  const combinedOdds = entry.selections.reduce((acc, s) => acc * s.odds, 1)
  const eachWayLeg = entry.selections.length === 1 && entry.selections[0].eachWay ? entry.selections[0] : null

  function computeReturn(stakeNum) {
    if (!stakeNum || stakeNum <= 0) return null
    if (eachWayLeg) {
      const terms = { fraction: eachWayLeg.eachWayFraction, places: eachWayLeg.eachWayPlaces }
      return Math.round(computeEachWayReturn(stakeNum, combinedOdds, terms, 'win') * 100) / 100
    }
    return Math.round(stakeNum * combinedOdds * 100) / 100
  }

  async function handleSave(e) {
    e.preventDefault()
    const stakeNum = stake ? Number(stake) : null
    if (stake && !(stakeNum > 0)) {
      setError('Stake must be a positive number.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const potentialReturn = computeReturn(stakeNum)
      if (isGroupPost) {
        await dataStore.updateBetPost(entry.id, { stake: stakeNum, stakeHidden, potentialReturn })
      } else {
        await dataStore.updateManualEntry(entry.id, { stake: stakeNum, potentialReturn })
      }
      onUpdated?.()
      showToast('Bet updated')
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this bet? This can’t be undone.')) return
    setDeleting(true)
    setError(null)
    try {
      if (isGroupPost) {
        await dataStore.deleteBetPost(entry.id)
      } else {
        await dataStore.deleteManualEntry(entry.id)
      }
      onDeleted?.()
      showToast('Bet deleted')
      onClose()
    } catch (err) {
      setError(err.message)
      setDeleting(false)
    }
  }

  return (
    <div className={`sheet-backdrop${closing ? ' closing' : ''}`} {...backdropDismissProps(requestClose)}>
      <div className={`sheet${closing ? ' closing' : ''}`}>
        <div className="sheet-handle" />
        <h2 className="sheet-title">Edit bet</h2>
        <p className="hint">
          {entry.selections.length > 1 ? `${entry.selections.length}-leg bet builder` : entry.selections[0].selection} · combined odds
          only shown at post time, not editable here.
        </p>
        <form onSubmit={handleSave}>
          <label className="field">
            <span>Stake</span>
            <input type="number" min="0" step="0.5" placeholder="£" value={stake} onChange={(e) => setStake(e.target.value)} autoFocus />
          </label>
          {isGroupPost && (
            <label className="filter-toggle">
              <input type="checkbox" checked={stakeHidden} onChange={(e) => setStakeHidden(e.target.checked)} />
              <span>Keep stake private</span>
            </label>
          )}
          {stake && Number(stake) > 0 && (
            <p className="hint">Potential return: £{computeReturn(Number(stake))?.toFixed(2) ?? '-'}</p>
          )}
          {error && <div className="auth-error">{error}</div>}
          <div className="sheet-actions">
            <button className="btn btn-primary" type="submit" disabled={saving || deleting}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <button className="btn btn-ghost" type="button" onClick={requestClose} disabled={saving || deleting}>
              Cancel
            </button>
            <button className="btn btn-danger-outline" type="button" onClick={handleDelete} disabled={saving || deleting}>
              {deleting ? 'Deleting…' : 'Delete bet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
