import { useState } from 'react'
import { useOddsFormat } from '../context/OddsFormatContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { parseOddsInput } from '../utils/oddsFormat.js'
import { kellyStake } from '../utils/kelly.js'
import { useEscapeKey } from '../lib/useEscapeKey.js'
import { useDelayedClose } from '../lib/useDelayedClose.js'
import PremiumGate from './PremiumGate.jsx'

const KELLY_FRACTIONS = [
  { value: 0.25, label: 'Quarter' },
  { value: 0.5, label: 'Half' },
  { value: 1, label: 'Full' }
]

// Standalone "what if" tool, independent of the bet slip - lets someone
// plan a stake against a price without first tapping a real outcome onto
// their slip. Odds input accepts either decimal or fractional text (see
// parseOddsInput) so it matches whatever the person is looking at on the
// bookmaker's own site, not just this app's own odds-format preference.
//
// The Kelly section below the payout numbers is opt-in (collapsed until odds
// are entered, and needs the user's own win-chance estimate to produce
// anything) - BetMates never supplies that probability itself, since that
// would cross into tipping. It only does the arithmetic on the user's own
// view of the price, same "reflect what's given, never predict" rule the
// Coach follows (src/lib/coach.js).
export default function PayoutCalculatorButton() {
  const [open, setOpen] = useState(false)
  const { format } = useOddsFormat()
  const { user } = useAuth()
  const [stake, setStake] = useState('')
  const [oddsInput, setOddsInput] = useState('')
  const [bankroll, setBankroll] = useState('')
  const [probability, setProbability] = useState('')
  const [kellyFraction, setKellyFraction] = useState(0.25)
  const { closing, requestClose } = useDelayedClose(close)
  useEscapeKey(requestClose, open)

  const decimal = parseOddsInput(oddsInput)
  const stakeNum = stake ? Number(stake) : null
  const potentialReturn = stakeNum > 0 && decimal > 1 ? Math.round(stakeNum * decimal * 100) / 100 : null
  const profit = potentialReturn !== null ? Math.round((potentialReturn - stakeNum) * 100) / 100 : null

  const bankrollNum = bankroll ? Number(bankroll) : user?.bankrollAmount ?? null
  const probabilityNum = probability ? Number(probability) / 100 : null
  const kelly =
    decimal > 1 && bankrollNum > 0 && probabilityNum
      ? kellyStake({ bankroll: bankrollNum, odds: decimal, probability: probabilityNum, fraction: kellyFraction })
      : null

  function close() {
    setOpen(false)
    setStake('')
    setOddsInput('')
    setBankroll('')
    setProbability('')
  }

  return (
    <>
      <button className="btn btn-ghost btn-small" onClick={() => setOpen(true)} type="button">
        🧮 Calculator
      </button>
      {open && (
        <div className={`sheet-backdrop${closing ? ' closing' : ''}`} onClick={requestClose}>
          <div className={`sheet${closing ? ' closing' : ''}`} onClick={(e) => e.stopPropagation()}>
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

            {decimal > 1 && (
              <PremiumGate isPremium={!!user?.isPremium} label="The Kelly staking calculator">
              <div className="kelly-calc">
                <p className="kelly-calc-title">Kelly stake (optional)</p>
                <p className="hint">
                  Uses your own estimate of the true chance - BetMates doesn't predict outcomes, so type in your own view.
                </p>
                <label className="field">
                  <span>Bankroll</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder={user?.bankrollAmount ? `£${user.bankrollAmount} (from your staking plan)` : '£'}
                    value={bankroll}
                    onChange={(e) => setBankroll(e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Your estimated win chance</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    placeholder="%"
                    value={probability}
                    onChange={(e) => setProbability(e.target.value)}
                  />
                </label>
                <div className="mode-switcher">
                  {KELLY_FRACTIONS.map((f) => (
                    <button
                      key={f.value}
                      type="button"
                      className={kellyFraction === f.value ? 'mode-tab active' : 'mode-tab'}
                      onClick={() => setKellyFraction(f.value)}
                    >
                      {f.label} Kelly
                    </button>
                  ))}
                </div>
                {kelly && (
                  <div className={kelly.stake > 0 ? 'potential-return' : 'hint'}>
                    {kelly.stake > 0
                      ? `Kelly suggests staking £${kelly.stake.toFixed(2)} (${(kelly.stakeFraction * 100).toFixed(1)}% of bankroll)`
                      : "No edge at this price for your estimate - Kelly says skip this one."}
                  </div>
                )}
              </div>
              </PremiumGate>
            )}

            <button className="btn btn-secondary" onClick={requestClose} type="button">
              Close
            </button>
          </div>
        </div>
      )}
    </>
  )
}
