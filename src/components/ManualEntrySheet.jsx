import { useEffect, useState } from 'react'
import * as dataStore from '../lib/dataStore.js'
import { BOOKMAKERS } from '../lib/bookmakers.js'
import { SPORT_LABEL } from '../lib/sportsConfig.js'
import { parseOddsInput } from '../utils/oddsFormat.js'
import { parseSlipText } from '../utils/betSlipOcr.js'
import { recognizeSlipText } from '../lib/ocr.js'
import { detectLossChasing } from '../utils/lossChasing.js'
import { useAsyncAction } from '../lib/useAsyncAction.js'
import { useEscapeKey } from '../lib/useEscapeKey.js'

const SPORT_OPTIONS = Object.entries(SPORT_LABEL).filter(([key]) => key !== 'multi')

// Freeform bet logging for anything that didn't come off the app's own Odds
// tab - a real bookmaker slip for a market this app doesn't list, an old
// paper slip, a bet placed somewhere else entirely. The optional photo scan
// (src/lib/ocr.js, client-side, no server involved) only ever prefills
// stake/odds - it can't reliably tell one bookmaker's slip layout from
// another's, so event/market/selection always stay free text for the user
// to type from what they can see in the photo or the raw recognised text
// shown below the scan control.
export default function ManualEntrySheet({ userId, onClose, onSaved }) {
  const [sport, setSport] = useState('football')
  const [event, setEvent] = useState('')
  const [market, setMarket] = useState('')
  const [selection, setSelection] = useState('')
  const [oddsInput, setOddsInput] = useState('')
  const [bookmaker, setBookmaker] = useState(BOOKMAKERS[0])
  const [stake, setStake] = useState('')
  const [scanning, setScanning] = useState(false)
  const [rawText, setRawText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [entries, setEntries] = useState(null)
  const runAsync = useAsyncAction()
  useEscapeKey(onClose, !saving && !scanning)

  useEffect(() => {
    Promise.all([dataStore.listBetPostsByUser(userId), dataStore.listManualEntries(userId)]).then(([posted, manual]) => {
      setEntries([...posted, ...manual])
    })
  }, [userId])

  const odds = parseOddsInput(oddsInput)
  const stakeNum = stake ? Number(stake) : null
  const potentialReturn = stakeNum && odds ? Math.round(stakeNum * odds * 100) / 100 : null
  const lossChasing = detectLossChasing(entries, stakeNum)

  async function scanImage(file) {
    setScanning(true)
    await runAsync(async () => {
      const text = await recognizeSlipText(file)
      setRawText(text)
      const guess = parseSlipText(text)
      if (guess.odds) setOddsInput(String(guess.odds))
      if (guess.stake) setStake(String(guess.stake))
    }, "Couldn't read that photo - fill the details in below instead")
    setScanning(false)
  }

  async function handleScan(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // lets picking the same file again re-fire onChange
    if (!file) return
    await scanImage(file)
  }

  // Lets a bookmaker-app screenshot go straight in with Ctrl+V/Cmd+V rather
  // than needing to be saved to a file first - a document-level listener
  // (same shape as useEscapeKey.js) rather than an onPaste prop, since paste
  // won't reliably bubble through one element if nothing in the sheet has
  // focus yet. Ignores anything without an image item, so pasting text into
  // Event/Market/Selection is unaffected.
  useEffect(() => {
    function handlePaste(e) {
      if (scanning) return
      const items = e.clipboardData?.items
      if (!items) return
      const imageItem = [...items].find((item) => item.type.startsWith('image/'))
      if (!imageItem) return
      e.preventDefault()
      scanImage(imageItem.getAsFile())
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [scanning])

  async function handleSave(e) {
    e.preventDefault()
    if (!event.trim() || !market.trim() || !selection.trim()) {
      setError('Fill in the event, market and selection.')
      return
    }
    if (!odds) {
      setError('Enter a valid price, e.g. 2.50 or 5/2.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await dataStore.addManualEntry({
        userId,
        sport,
        marketType: market.trim(),
        selections: [{ event: event.trim(), market: market.trim(), selection: selection.trim(), odds, bookmaker }],
        stake: stakeNum,
        potentialReturn
      })
      onSaved?.()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <h2 className="sheet-title">Log a bet</h2>
        <p className="hint">For anything that didn't come off the Odds tab - a real slip, an old bet, anything from elsewhere.</p>

        <label className="field">
          <span>📷 Scan a bet slip photo (optional)</span>
          <input type="file" accept="image/*" capture="environment" onChange={handleScan} disabled={scanning} />
        </label>
        <p className="hint">or paste a screenshot - Ctrl+V / ⌘V</p>
        {scanning && <p className="hint">Reading your slip…</p>}
        {rawText && (
          <details className="ocr-raw-text">
            <summary>Recognised text - odds/stake below are a guess, copy the rest in yourself</summary>
            <pre>{rawText}</pre>
          </details>
        )}

        <form onSubmit={handleSave}>
          <label className="field">
            <span>Sport</span>
            <select value={sport} onChange={(e) => setSport(e.target.value)}>
              {SPORT_OPTIONS.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Event</span>
            <input value={event} onChange={(e) => setEvent(e.target.value)} placeholder="Arsenal v Chelsea" maxLength={120} />
          </label>
          <label className="field">
            <span>Market</span>
            <input value={market} onChange={(e) => setMarket(e.target.value)} placeholder="Match Result" maxLength={80} />
          </label>
          <label className="field">
            <span>Selection</span>
            <input value={selection} onChange={(e) => setSelection(e.target.value)} placeholder="Arsenal to win" maxLength={120} />
          </label>
          <label className="field">
            <span>Odds</span>
            <input value={oddsInput} onChange={(e) => setOddsInput(e.target.value)} placeholder="2.50 or 5/2" />
          </label>
          <label className="field">
            <span>Bookmaker</span>
            <select value={bookmaker} onChange={(e) => setBookmaker(e.target.value)}>
              {BOOKMAKERS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
              <option value="Other">Other</option>
            </select>
          </label>
          <label className="field">
            <span>Stake (optional)</span>
            <input type="number" min="0" step="0.5" placeholder="£" value={stake} onChange={(e) => setStake(e.target.value)} />
          </label>
          {potentialReturn ? <p className="hint">Potential return: £{potentialReturn.toFixed(2)}</p> : null}
          {lossChasing && (
            <div className="limit-warning">
              👀 Your last logged bet lost at £{lossChasing.lastStake.toFixed(2)} - this one's {lossChasing.increasePct}% bigger. No
              judgement, just flagging it.
            </div>
          )}
          {error && <div className="auth-error">{error}</div>}
          <div className="sheet-actions">
            <button className="btn btn-primary" type="submit" disabled={saving || scanning}>
              {saving ? 'Saving…' : 'Save to Tracker'}
            </button>
            <button className="btn btn-ghost" type="button" onClick={onClose} disabled={saving}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
