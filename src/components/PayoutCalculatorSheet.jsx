import { useState } from 'react'
import { useOddsFormat } from '../context/OddsFormatContext.jsx'
import { parseOddsInput } from '../utils/oddsFormat.js'

// Standalone "what if" tool, independent of the bet slip - lets someone
// plan a stake against a price without first tapping a real outcome onto
// their slip. Odds input accepts either decimal or fractional text (see
// parseOddsInput) so it matches whatever the person is looking at on the
// bookmaker's own site, not just this app's own odds-format preference.
export default function PayoutCalculatorButton() {
  const [open, setOpen] = useState(false)
  const { format } = useOddsFormat()
  const [stake, setStake] = useState('')
  const [oddsInput, setOddsInput] = useState('')

  const decimal = parseOddsInput(oddsInput)
  const stakeNum = stake ? Number(stake) : null
  const potentialReturn = stakeNum > 0 && decimal > 1 ? Math.round(stakeNum * decimal * 100) / 100 : null
  const profit = potentialReturn !== null ? Math.round((potentialReturn - stakeNum) * 100) / 100 : null

  function close() {
    setOpen(false)
    setStake('')
    setOddsInput('')
  }

  return (
    <>
      <button className="btn btn-ghost btn-small" onClick={() => setOpen(true)} type="button">
        🧮 Calculator
      </button>
      {open && (
        <div className="sheet-backdrop" onClick={close}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <h2 className="sheet-title">Payout calculator</h2>
            <p className="hint">Plan a stake before you pick anything - this doesn't touch your bet slip.</p>

            <label className="field">
              <span>Stake</span>
              <input type="number" min="0" step="0.5" placeholder="£" value={stake} onChange={(e) => setStake(e.target.value)} autoFocus />
            </label>

            <label className="field">
              <span>Odds ({format === 'fractional' ? 'e.g. 5/2' : 'e.g. 2.50'})</span>
              <input
                type="text"
                placeholder={format === 'fractional' ? '5/2' : '2.50'}
                value={oddsInput}
                onChange={(e) => setOddsInput(e.target.value)}
              />
            </label>

            {oddsInput.trim() && decimal === null && (
              <div className="auth-error">Couldn't read that price - try "2.50" or "5/2".</div>
            )}

            {potentialReturn !== null && (
              <>
                <div className="potential-return">
                  Potential return: <strong>£{potentialReturn.toFixed(2)}</strong>
                </div>
                <div className="potential-return">
                  Profit: <strong>£{profit.toFixed(2)}</strong>
                </div>
              </>
            )}

            <button className="btn btn-secondary" onClick={close} type="button">
              Close
            </button>
          </div>
        </div>
      )}
    </>
  )
}
