import { useEffect, useState } from 'react'
import * as dataStore from '../lib/dataStore.js'
import { rankPredictions } from '../utils/tablePredictor.js'
import { useAsyncAction } from '../lib/useAsyncAction.js'
import EmptyState from './EmptyState.jsx'
import { ClipboardIcon } from './icons/Icons.jsx'

// A slower-burn group game than Pick'em (single match, weekly) - predict a
// whole competition's final order at any point, scored against a snapshot
// of the real standings that any member can update. Trust-based like
// everything else self-reported in this app: there's no live table fetch,
// just a shared, editable list - as accurate as whoever last typed it in.
// One active predictor per group in this version - see
// supabase/schema.sql's predictors table.
export default function TablePredictorPanel({ groupId, userId, memberNames }) {
  const [predictor, setPredictor] = useState(undefined) // undefined = loading, null = none yet
  const [entries, setEntries] = useState([])
  const [competitionInput, setCompetitionInput] = useState('')
  const [participantsInput, setParticipantsInput] = useState('')
  const [order, setOrder] = useState([])
  const [standingsOrder, setStandingsOrder] = useState(null)
  const [editingStandings, setEditingStandings] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const runAsync = useAsyncAction()

  useEffect(() => {
    refresh()
  }, [groupId])

  function refresh() {
    return dataStore.getPredictor(groupId).then((p) => {
      setPredictor(p)
      if (!p) return
      return dataStore.listPredictorEntries(p.id).then((es) => {
        setEntries(es)
        const mine = es.find((e) => e.userId === userId)
        setOrder(mine ? mine.predictedOrder : p.participants)
      })
    })
  }

  async function handleCreate(e) {
    e.preventDefault()
    const competition = competitionInput.trim()
    const participants = participantsInput
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    if (!competition || participants.length < 2) {
      setError('Name the competition and list at least two teams, one per line.')
      return
    }
    setSaving(true)
    setError(null)
    const ok = await runAsync(() => dataStore.createPredictor(groupId, userId, competition, participants), "Couldn't start that - try again")
    setSaving(false)
    if (ok) refresh()
  }

  async function handleSaveOrder() {
    setSaving(true)
    const ok = await runAsync(
      () => dataStore.submitPredictorEntry(predictor.id, userId, order),
      "Couldn't save your prediction - try again"
    )
    setSaving(false)
    if (ok) refresh()
  }

  async function handleSaveStandings() {
    setSaving(true)
    const ok = await runAsync(
      () => dataStore.updateStandings(predictor.id, userId, standingsOrder),
      "Couldn't save the standings - try again"
    )
    setSaving(false)
    if (ok) {
      setEditingStandings(false)
      refresh()
    }
  }

  if (predictor === undefined) return <div className="loading">Loading the predictor…</div>

  if (predictor === null) {
    return (
      <>
        <p className="hint">
          Predict the final order for a whole competition, not just one match - score it against the real table whenever someone
          updates it. There's no live table fetch here; it's only as accurate as whoever last typed it in.
        </p>
        <form onSubmit={handleCreate}>
          <label className="field">
            <span>Competition</span>
            <input
              value={competitionInput}
              onChange={(e) => setCompetitionInput(e.target.value)}
              placeholder="Premier League 2026/27"
              maxLength={60}
            />
          </label>
          <label className="field">
            <span>Teams (one per line, any order to start)</span>
            <textarea
              value={participantsInput}
              onChange={(e) => setParticipantsInput(e.target.value)}
              rows={8}
              placeholder={'Arsenal\nAston Villa\nBournemouth\n…'}
            />
          </label>
          {error && <div className="auth-error">{error}</div>}
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? 'Starting…' : 'Start the predictor'}
          </button>
        </form>
      </>
    )
  }

  const ranked = rankPredictions(entries, predictor.currentStandings, memberNames)
  const myEntry = entries.find((e) => e.userId === userId)

  return (
    <>
      <p className="hint">{predictor.competition}</p>

      <h3 className="market-title">Your prediction</h3>
      <OrderList items={order} onChange={setOrder} disabled={saving} context="your prediction" />
      <button className="btn btn-primary btn-small" onClick={handleSaveOrder} disabled={saving}>
        {saving ? 'Saving…' : myEntry ? 'Update prediction' : 'Submit prediction'}
      </button>

      <h3 className="market-title">Current standings</h3>
      {!editingStandings ? (
        <>
          {predictor.currentStandings ? (
            <ol className="predictor-standings-list">
              {predictor.currentStandings.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ol>
          ) : (
            <EmptyState
              icon={<ClipboardIcon width={26} height={26} />}
              title="No standings entered yet"
              subtitle="Any member can enter the real current table to start scoring."
            />
          )}
          <button
            className="btn btn-ghost btn-small"
            onClick={() => {
              setStandingsOrder(predictor.currentStandings ?? predictor.participants)
              setEditingStandings(true)
            }}
          >
            {predictor.currentStandings ? 'Update standings' : 'Enter standings'}
          </button>
        </>
      ) : (
        <>
          <OrderList items={standingsOrder} onChange={setStandingsOrder} disabled={saving} context="the standings" />
          <div className="sheet-actions">
            <button className="btn btn-primary btn-small" onClick={handleSaveStandings} disabled={saving}>
              {saving ? 'Saving…' : 'Save standings'}
            </button>
            <button className="btn btn-ghost btn-small" onClick={() => setEditingStandings(false)} disabled={saving}>
              Cancel
            </button>
          </div>
        </>
      )}

      {ranked.length > 0 && (
        <>
          <h3 className="market-title">Leaderboard</h3>
          <div className="leaderboard-list leaderboard-list-standalone">
            {ranked.map((row, i) => (
              <div key={row.userId} className={i === 0 ? 'leaderboard-row leaderboard-row-top' : 'leaderboard-row'}>
                <span className="leaderboard-rank">#{i + 1}</span>
                <span className="leaderboard-name">{row.name}</span>
                <span className="leaderboard-meta">{row.score} place{row.score === 1 ? '' : 's'} off</span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}

// Up/down reordering rather than drag-and-drop - no extra dependency, and
// works the same on touch and desktop without a library. `context` goes
// into each button's aria-label ("...in your prediction" vs "...in the
// standings") since the two lists on screen at once share the same team
// names - without it, a screen reader (or a query selector) has no way to
// tell which "Move Alpha FC up" button is which.
function OrderList({ items, onChange, disabled, context }) {
  // onChange is always a plain useState setter (setOrder/setStandingsOrder),
  // so passing it a function goes through React's functional-update form -
  // reading the true latest state instead of the `items` this render closed
  // over. Without that, two clicks landing in the same batch (e.g. a fast
  // double-tap) would both compute from the same stale array and the first
  // move would silently vanish.
  function move(i, dir) {
    onChange((prev) => {
      const next = [...prev]
      const j = i + dir
      if (j < 0 || j >= next.length) return prev
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }
  return (
    <div className="manage-list">
      {items.map((name, i) => (
        <div key={name} className="manage-list-row">
          <span>
            {i + 1}. {name}
          </span>
          <span>
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={() => move(i, -1)}
              disabled={disabled || i === 0}
              aria-label={`Move ${name} up in ${context}`}
            >
              ↑
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={() => move(i, 1)}
              disabled={disabled || i === items.length - 1}
              aria-label={`Move ${name} down in ${context}`}
            >
              ↓
            </button>
          </span>
        </div>
      ))}
    </div>
  )
}
