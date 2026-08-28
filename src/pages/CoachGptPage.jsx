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
import CoachHistorySheet from '../components/CoachHistorySheet.jsx'
import { PencilIcon, SparkIcon } from '../components/icons/Icons.jsx'

// Active session id lives in localStorage, not React state alone, so it
// survives a reload rather than silently starting a new chat every visit -
// "New chat" is the only thing that's meant to move it. See schema.sql's
// coach_messages.session_id comment for why messages are grouped this way
// at all.
function activeSessionKey(userId) {
  return `coachgpt_session_${userId}`
}
function loadOrCreateSessionId(userId) {
  const key = activeSessionKey(userId)
  const existing = localStorage.getItem(key)
  if (existing) return existing
  const id = crypto.randomUUID()
  localStorage.setItem(key, id)
  return id
}

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

function formatPickDate(iso) {
  if (!iso) return '—'
  const d = new Date(`${iso}T00:00:00`)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
function resultTone(result) {
  if (result === 'won') return 'tone-good'
  if (result === 'lost') return 'tone-bad'
  return 'tone-muted'
}
function resultLabel(result) {
  if (result === 'won') return 'Won'
  if (result === 'lost') return 'Lost'
  if (result === 'void') return 'Void'
  return 'Pending'
}

// CoachGPT's OWN pick-of-the-day form - the public coach_daily_picks record that
// netlify/functions/coach-pick.js builds and coach-settle.js grades. Distinct
// from CoachScoreboard above, which is the signed-in user's tally of Coach's
// chat picks; this one is global (the same for everyone) and real fixtures only.
// Reuses computeCoachRecord since a daily pick carries the same
// recommendation/result shape a chat pick does, so the two can never disagree.
function CoachForm({ record, picks }) {
  if (!picks?.length) return null
  const recent = picks.slice(0, 6)
  return (
    <div className="coach-form">
      <div className="coach-form-head">
        <h2 className="coach-form-title">Coach&apos;s form</h2>
        <span className="coach-form-sub">his own daily picks on real fixtures</span>
      </div>
      {record ? (
        <div className="stat-tiles">
          <div className={`stat-tile ${record.winRate >= 50 ? 'tone-good' : record.winRate == null ? '' : 'tone-bad'}`}>
            <div className="stat-tile-value">{record.winRate == null ? '—' : `${record.winRate}%`}</div>
            <div className="stat-tile-label">Win rate</div>
          </div>
          <div className={`stat-tile ${record.profit >= 0 ? 'tone-good' : 'tone-bad'}`}>
            <div className="stat-tile-value">{record.profit >= 0 ? '+' : ''}{record.profit.toFixed(1)}u</div>
            <div className="stat-tile-label">Notional P&amp;L</div>
          </div>
          <div className="stat-tile">
            <div className="stat-tile-value">{record.decidedCount}</div>
            <div className="stat-tile-label">Picks settled</div>
          </div>
        </div>
      ) : (
        <p className="hint">No settled picks yet - Coach is still building his record.</p>
      )}
      <ul className="coach-form-picks">
        {recent.map((p) => (
          <li key={p.id} className="coach-form-pick">
            <span className="cfp-date">{formatPickDate(p.pickDate)}</span>
            <span className="cfp-sel">
              {p.recommendation?.selection ?? '—'}
              {p.recommendation?.odds ? ` @ ${Number(p.recommendation.odds).toFixed(2)}` : ''}
            </span>
            <span className={`cfp-result ${resultTone(p.result)}`}>{resultLabel(p.result)}</span>
          </li>
        ))}
      </ul>
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
          className="btn btn-secondary btn-small icon-row"
          onClick={() => onPick(leg)}
        >
          <PencilIcon width={13} height={13} /> {leg.selection} @ {leg.odds.toFixed(2)}
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
  const [sessionId, setSessionId] = useState(() => loadOrCreateSessionId(user.id))
  const [messages, setMessages] = useState(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [error, setError] = useState(null)
  const [showHistory, setShowHistory] = useState(false)
  const [recordMessages, setRecordMessages] = useState(null)
  const [dailyPicks, setDailyPicks] = useState(null)
  const [limited, setLimited] = useState(false)
  const runAsync = useAsyncAction()
  const prefillSent = useRef(false)
  // CoachGPT's overall pick record spans every past conversation, not just
  // the one on screen - fetched separately from the active session's
  // `messages` so switching/starting chats doesn't make the scoreboard
  // flicker empty.
  const coachRecord = useMemo(() => computeCoachRecord(recordMessages), [recordMessages])
  // Coach's own daily-pick form - global, so fetched once, not per user/session.
  const coachForm = useMemo(() => computeCoachRecord(dailyPicks), [dailyPicks])

  useEffect(() => {
    dataStore
      .listCoachMessages(user.id, sessionId)
      .then(setMessages)
      .catch((err) => setError(err.message))
  }, [user.id, sessionId])

  useEffect(() => {
    dataStore.listCoachMessages(user.id).then(setRecordMessages).catch(() => setRecordMessages([]))
  }, [user.id])

  useEffect(() => {
    dataStore.listCoachDailyPicks().then(setDailyPicks).catch(() => setDailyPicks([]))
  }, [])

  function startNewChat() {
    const id = crypto.randomUUID()
    localStorage.setItem(activeSessionKey(user.id), id)
    setSessionId(id)
    setMessages([])
    setError(null)
    setUnavailable(false)
  }

  function switchToSession(id) {
    localStorage.setItem(activeSessionKey(user.id), id)
    setSessionId(id)
    setShowHistory(false)
  }

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
    setLimited(false)
    // A single failed send (a timeout, a network blip) used to leave the
    // "CoachGPT isn't set up on this environment" banner stuck true for the
    // rest of the session even after a later message succeeded fine - this
    // was only ever cleared by starting a brand new chat, so one transient
    // failure made the whole feature look permanently broken.
    setUnavailable(false)

    let blocked = false
    const ok = await runAsync(async () => {
      // Checked before persisting the user's own message - a blocked call
      // shouldn't burn a slot of the free monthly allowance it never
      // actually used (coachgpt.js counts messages already in the DB), and
      // there'd be nothing to show a reply under anyway.
      const accessToken = await dataStore.getAccessToken()
      const res = await sendCoachGptMessage({ message: body, history, priorGrounding, accessToken })
      if (!res.configured) {
        setUnavailable(true)
        blocked = true
        return
      }
      if (res.limited) {
        setLimited(true)
        blocked = true
        return
      }
      await dataStore.addCoachMessage({ userId: user.id, sessionId, role: 'user', body })
      // res.reply can still come back empty even though the HTTP request
      // succeeded. Two very different reasons, two very different messages:
      // res.error set = the Anthropic call itself failed (expired/invalid key,
      // model access, rate limit) - that's a system fault, so DON'T blame the
      // user's phrasing the way the old single fallback did; res.error null but
      // reply empty = the model genuinely returned nothing, where "try again
      // with more detail" is the right nudge. Named replyBody, not body -
      // shadowing the outer `body` param here throws a real "Cannot access
      // before initialization" TDZ error the moment this block's first `body`
      // reference (a few lines up) runs, since a const anywhere in a scope
      // claims that name for the WHOLE scope.
      const replyBody =
        res.reply ||
        (res.error
          ? "I can't get to my playbook right now, champ - that's on my end, not your question. Give it a minute and run it back."
          : "Couldn't get a straight answer that time - mind trying again, maybe with a bit more detail?")
      const assistantMessage = await dataStore.addCoachMessage({
        userId: user.id,
        sessionId,
        role: 'assistant',
        body: replyBody,
        grounding: res.grounding ?? null,
        recommendation: res.recommendation ?? null
      })
      setMessages((m) => [...(m ?? []), assistantMessage])
    }, "Couldn't reach the Coach - try again")
    setSending(false)
    if (!ok || blocked) setMessages((m) => (m ?? []).filter((x) => x.id !== userMessage.id))
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
        <div className="topbar-row">
          <h1>CoachGPT</h1>
          <div className="topbar-actions">
            <button className="btn btn-ghost btn-small" type="button" onClick={() => setShowHistory(true)}>
              History
            </button>
            <button className="btn btn-ghost btn-small" type="button" onClick={startNewChat} disabled={sending}>
              New chat
            </button>
          </div>
        </div>
      </div>
      <p className="hint">Ask about a fixture or a player - CoachGPT will give you a real lean, backed by the actual odds and data on the board.</p>
      <CoachScoreboard record={coachRecord} />
      <CoachForm record={coachForm} picks={dailyPicks} />
      {showHistory && (
        <CoachHistorySheet
          userId={user.id}
          activeSessionId={sessionId}
          onSelect={switchToSession}
          onClose={() => setShowHistory(false)}
        />
      )}

      {error && <div className="error">Couldn't load your conversation: {error}</div>}
      {unavailable && (
        <div className="error">CoachGPT isn&apos;t set up on this environment right now - the rest of the app works as normal.</div>
      )}
      {limited && (
        <div className="premium-upsell">
          <p>You&apos;ve used your 10 free CoachGPT messages this month.</p>
          <Link className="btn btn-primary btn-small" to="/account#plus">
            Upgrade to Plus for unlimited
          </Link>
        </div>
      )}

      <div className="group-chat">
        {messages === null && !error && <div className="loading">Loading your conversation…</div>}
        {messages && !messages.length && (
          <EmptyState
            icon={<SparkIcon width={26} height={26} />}
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
                  {!mine && (
                    <span className="coach-card-badge">
                      <SparkIcon width={16} height={16} />
                    </span>
                  )}
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
                <span className="coach-card-badge">
                  <SparkIcon width={16} height={16} />
                </span>
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
