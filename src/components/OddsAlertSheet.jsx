import { useState } from 'react'
import * as dataStore from '../lib/dataStore.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useOddsFormat } from '../context/OddsFormatContext.jsx'
import { formatOdds } from '../utils/oddsFormat.js'
import { useEscapeKey } from '../lib/useEscapeKey.js'
import { useDelayedClose } from '../lib/useDelayedClose.js'
import { useToast } from '../context/ToastContext.jsx'
import { backdropDismissProps } from '../lib/sheetDismiss.js'

// Opened from the bell button on an outcome row (FixtureDetailPage,
// FightDetailPage, GenericEventDetailPage - not RaceDetailPage, see
// racingClient.js's mock-only note, odds there never move so a target
// alert would never mean anything). `target` carries everything
// netlify/functions/alert-checks.js needs to re-fetch this exact
// outcome later and compare its price - see dataStore.js's createOddsAlert.
export default function OddsAlertSheet({ target, onClose, onCreated }) {
  const { user } = useAuth()
  const { format } = useOddsFormat()
  const { showToast } = useToast()
  const { closing, requestClose } = useDelayedClose(onClose)
  useEscapeKey(requestClose)
  const [targetPrice, setTargetPrice] = useState(target.currentDecimal.toFixed(2))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleSave(e) {
    e.preventDefault()
    const decimal = Number(targetPrice)
    if (!(decimal > 1)) {
      setError('Enter odds greater than 1.00.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const alert = await dataStore.createOddsAlert(user.id, {
        sport: target.sport,
        eventId: target.eventId,
        eventLabel: target.eventLabel,
        kickoff: target.kickoff,
        marketKey: target.marketKey,
        marketLabel: target.marketLabel,
        outcomeName: target.outcomeName,
        selectionLabel: target.selectionLabel,
        targetDecimal: decimal
      })
      onCreated?.(alert)
      showToast('Alert set')
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={`sheet-backdrop${closing ? ' closing' : ''}`} {...backdropDismissProps(requestClose)}>
      <div className={`sheet${closing ? ' closing' : ''}`}>
        <div className="sheet-handle" />
        <h2 className="sheet-title">Set a price alert</h2>
        <p className="hint">
          {target.eventLabel} · {target.marketLabel}: {target.selectionLabel}
        </p>
        <p className="hint">Current price: {formatOdds(target.currentDecimal, format)}</p>
        <form onSubmit={handleSave}>
          <label className="field">
            <span>Alert me when it reaches (decimal odds)</span>
            <input
              type="number"
              min="1.01"
              step="0.01"
              value={targetPrice}
              onChange={(e) => setTargetPrice(e.target.value)}
              autoFocus
            />
          </label>
          {error && <div className="auth-error">{error}</div>}
          <div className="sheet-actions">
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Set alert'}
            </button>
            <button className="btn btn-ghost" type="button" onClick={requestClose} disabled={saving}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
