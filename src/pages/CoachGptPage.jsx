import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useBetSlip } from '../context/BetSlipContext.jsx'
import * as dataStore from '../lib/dataStore.js'
import { sendCoachGptMessage } from '../api/coachGptClient.js'
import { useAsyncAction } from '../lib/useAsyncAction.js'
import { formatRelativeTime } from '../utils/format.js'
import { computeCoachRecord } from '../utils/coachRecord.js'
import EmptyState from '../components/EmptyState.jsx'

// Only appears once there's real settled history - CoachGPT's own picks
// start from zero (there's no way to backfill a record for chats that
// predate lock_in_recommendation), so an empty/near-empty scoreboard would
// just read as broken rather than "not enough data yet".
function CoachScoreboard({ record }) {
  if (!record) return null
  return (
    <div className="stat-tiles">
      <div className={`stat-tile ${record.winRate >= 50 ? 'tone-good' : record.winRate == null ? '' : 'tone-bad'}`}>
        <div className="stat-tile-value">{record.winRate == null ? '—' : `${record.winRate}%`}</div>
        <div className="stat-tile-label">Win rate</div>
      </div>
      <div className={`stat-tile ${record.profit >= 0 ? 'tone-good' : 'tone-bad'}`}>
        <div className="stat-tile-value">{record.profit >= 0 ? '+' : ''}{record.profit.toFixed(1)}u</div>
        <div className="stat-tile-label">Notional P&L</div>
      </div>
      <div className="stat-tile">
        <div className="stat-tile-value">{record.decidedCount}</div>
        <div className="stat-tile-label">Picks settled</div>
      </div>
    </div>
  )
}

// "Log this" - a message's `grounding` (see netlify/functions/coachgpt.js's
// groundFixtureOutcomes/groundRunner) is real BetSlip legs, not a parse of
// CoachGPT's prose reply. Rather than guess which one it actually leaned on
// from free text, every priced option from the fixture/race it looked up
// is offered so the user picks the one it was talking about - same number
// of taps as picking a price on the Odds tab, just without retyping it.
function LogThisRow({ legs, onPick }) {
  if (!legs?.length) return null
  return (
    <div className="topbar-actions" style={{ flexWrap: 'wrap', marginTop: 6 }}>
      {legs.map((leg) => (
        <button
          key={`${leg.selection}-${leg.eventId ?? leg.horseId ?? leg.event}`}
          className="btn btn-secondary btn-small"
          onClick={() => onPick(leg)}
        >
          📝 {leg.selection} @ {leg.odds.toFixed(2)}
        </button>
      ))}
    </div>
  )
}

// A different voice from the Insights page's "Coach's take" (CoachTake.jsx) -
// that one only ever reflects a user's own record and never tips. This is a
// real ask-anything chat, allowed to give an opinionated lean on a specific
// fixture or answer "tell me about [player]" - see src/lib/coachgpt.js's
// header comment for why the two are kept deliberately separate. Reuses the
// exact .group-chat/.chat-messages/.chat-input-row shell DirectMessagePage
// already uses - a chat is a chat.
const EXAMPLE_PROMPTS = ['What’s the value bet for Arsenal tonight?', 'Tell me about Erling Haaland', 'Best bet on the card this weekend?']

export default function CoachGptPage() {
  const { user } = useAuth()
  const { loadLegs } = useBetSlip()
  const location = useLocation()
  const navigate = useNavigate()
  const [messages, setMessages] = useState(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [error, setError] = useState(null)
  const runAsync = useAsyncAction()
  const prefillSent = useRef(false)
  const coachRecord = useMemo(() => computeCoachRecord(messages), [messages])

  useEffect(() => {
    dataStore
      .listCoachMessages(user.id)
      .then(setMessages)
      .catch((err) => setError(err.message))
  }, [user.id])

  // Arrived here via an "Ask CoachGPT about this" link (e.g.
  // FixtureDetailPage.jsx) carrying a pre-built question in router state -
  // send it automatically rather than just dropping it in the input, since
  // the button itself already reads as "ask this", not "let me draft a
  // question". Guarded by a ref (not just the empty router state below)
  // so React StrictMode's double-effect or a re-render mid-send can't fire
  // it twice; the state is cleared via `replace` navigation once consumed
  // so a later back/forward or refresh on this page doesn't resend it.
  useEffect(() => {
    const prefill = location.state?.prefill
    if (!prefill || messages === null || prefillSent.current) return
    prefillSent.current = true
    navigate(location.pathname, { replace: true, state: {} })
    sendMessage(prefill)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, messages])

  async function sendMessage(body) {
    const userMessage = { id: `pending-${Date.now()}`, userId: user.id, role: 'user', body, createdAt: new Date().toISOString() }
    const history = (messages ?? []).slice(-12).map((m) => ({ role: m.role, content: m.body }))
    // The netlify function only knows about a fixture's grounding (priced
    // legs) if IT called find_fixture this turn - a natural follow-up like
    // "who do you like there?" often doesn't, since the model already has
    // the prices in `history`. Without this, lock_in_recommendation has
    // nothing to match against and silently drops a real pick. Carrying the
    // last grounded message's data along (separately from `history`, which
    // only ever holds role+text for Claude) lets the function fall back to
    // it when this turn's own tool calls come up empty.
    const priorGrounding = [...(messages ?? [])].reverse().find((m) => m.grounding)?.grounding ?? null
    setMessages((m) => [...(m ?? []), userMessage])
    setSending(true)

    const ok = await runAsync(async () => {
      await dataStore.addCoachMessage({ userId: user.id, role: 'user', body })
      const res = await sendCoachGptMessage({ message: body, history, priorGrounding })
      if (!res.configured) {
        setUnavailable(true)
        return
      }
      // res.reply can still come back empty on a genuine Anthropic failure
      // (bad key, network blip) even though the request itself succeeded -
      // that must never just vanish silently, or it reads exactly like the
      // "coach isn't replying" bug this file used to have. Named replyBody,
      // not body - shadowing the outer `body` param here throws a real
      // "Cannot access before initialization" TDZ error the moment this
      // block's first `body` reference (a few lines up) runs, since a
      // const anywhere in a scope claims that name for the WHOLE scope.
      const replyBody = res.reply || "Couldn't get a straight answer that time - mind trying again, maybe with a bit more detail?"
      const assistantMessage = await dataStore.addCoachMessage({
        userId: user.id,
        role: 'assistant',
        body: replyBody,
        grounding: res.grounding ?? null,
        recommendation: res.recommendation ?? null
      })
      setMessages((m) => [...(m ?? []), assistantMessage])
    }, "Couldn't reach the Coach - try again")
    setSending(false)
    if (!ok) setMessages((m) => (m ?? []).filter((x) => x.id !== userMessage.id))
  }

  function handleSend(e) {
    e.preventDefault()
    const body = draft.trim()
    if (!body) return
    setDraft('')
    sendMessage(body)
  }

  return (
    <div>
      <div className="topbar">
        <Link to="/dashboard" className="back">
          &larr; Home
        </Link>
        <h1>CoachGPT</h1>
      </div>
      <p className="hint">Ask about a fixture or a player - CoachGPT will give you a real lean, backed by the actual odds and data on the board.</p>
      <CoachScoreboard record={coachRecord} />

      {error && <div className="error">Couldn't load your conversation: {error}</div>}
      {unavailable && (
        <div className="error">CoachGPT isn&apos;t set up on this environment right now - the rest of the app works as normal.</div>
      )}

      <div className="group-chat">
        {messages === null && !error && <div className="loading">Loading your conversation…</div>}
        {messages && !messages.length && (
          <EmptyState
            icon="🧠"
            title="Ask CoachGPT anything"
            subtitle={`Try: "${EXAMPLE_PROMPTS[0]}" or "${EXAMPLE_PROMPTS[1]}"`}
          />
        )}
        {messages && messages.length > 0 && (
          <div className="chat-messages">
            {messages.map((m) => {
              const mine = m.role === 'user'
              return (
                <div key={m.id} className={mine ? 'chat-message chat-message-mine' : 'chat-message'}>
                  {!mine && <span className="coach-card-badge">🧠</span>}
                  <div>
                    <div className={mine ? 'chat-bubble' : 'chat-bubble coach-chat-bubble'}>
                      <div>{m.body}</div>
                    </div>
                    {!mine && <LogThisRow legs={m.grounding} onPick={(leg) => loadLegs([leg])} />}
                    <div className="chat-message-time">{formatRelativeTime(m.createdAt)}</div>
                  </div>
                </div>
              )
            })}
            {sending && (
              <div className="chat-message">
                <span className="coach-card-badge">🧠</span>
                <div className="chat-bubble coach-chat-bubble">
                  <div>Thinking…</div>
                </div>
              </div>
            )}
          </div>
        )}
        <form className="chat-input-row" onSubmit={handleSend}>
          <input
            placeholder="Ask about a fixture or a player…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={500}
            disabled={sending}
          />
          <button className="btn btn-primary btn-small" type="submit" disabled={sending || !draft.trim()}>
            Send
          </button>
        </form>
      </div>
    </div>
  )
}
