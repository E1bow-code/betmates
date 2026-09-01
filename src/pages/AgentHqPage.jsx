import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import * as dataStore from '../lib/dataStore.js'
import { formatRelativeTime } from '../utils/format.js'

// Agent HQ - a live, admin-only control room for the scheduled "agent"
// ecosystem (the pixel-art BetMates Ops cast made real). PHASE 1 is read-only:
// each agent is a room whose status is pulled from real data where the anon key
// can read it (Coco -> social_posts, Sage -> idea_proposals, CoachGPT ->
// coach_daily_picks, all admin/public RLS-readable). The other agents fire
// server-side on their own schedules with no direct client feed yet, so they
// show as "on watch" - a later phase adds a service-role read (like
// getAdminAnalytics) to make them live too, then the controls (approve/reject,
// run-now, on/off) land on top.
//
// Gating mirrors the other admin pages: the redirect is UX only; the real
// enforcement is RLS (social_posts / idea_proposals are admin-read).

// The cast, their colours (from the BetMates Ops sim), where each one's status
// comes from (`source`), and its on/off `settingsKey` (agent_settings) - the
// five research-desk agents share one function, so they share the 'desk' key.
const AGENTS = [
  { key: 'coco', name: 'Coco', role: 'Social Media Mgr', color: '#ff77b6', sprite: '📣', source: 'coco', settingsKey: 'coco', signal: 'Daily promo post → approve → X' },
  { key: 'sage', name: 'Sage', role: 'Ideas / R&D', color: '#ffce4d', sprite: '💡', source: 'sage', settingsKey: 'sage', signal: 'Fact-checked idea → approve → GitHub' },
  { key: 'coach', name: 'CoachGPT', role: 'The Coach', color: '#c9a6ff', sprite: '🧠', source: 'coach', settingsKey: 'coach', signal: 'Daily pick, graded' },
  { key: 'dex', name: 'Dex', role: 'Data Engineer', color: '#5c97ff', sprite: '🛠️', source: 'watch', settingsKey: 'dex', signal: 'Settlement + CI alerts' },
  { key: 'mira', name: 'Mira', role: 'Odds Analyst', color: '#37e0d6', sprite: '🔔', source: 'watch', settingsKey: 'mira', signal: 'Odds-alert hits' },
  { key: 'nova', name: 'Nova', role: 'Markets Trader', color: '#37e0a0', sprite: '📈', source: 'watch', settingsKey: 'nova', signal: 'Sharp-money moves' },
  { key: 'priya', name: 'Priya', role: 'Compliance', color: '#ff6a5d', sprite: '⚠️', source: 'watch', settingsKey: 'priya', signal: 'Spend-limit escalations' },
  { key: 'bea', name: 'Bea', role: 'Community', color: '#ffa24d', sprite: '🎉', source: 'watch', settingsKey: 'bea', signal: 'Group member milestones' },
  { key: 'jonas', name: 'Jonas', role: 'Form Scout', color: '#ff9a4d', sprite: '📋', source: 'desk', settingsKey: 'desk', signal: 'Matchday brief — form' },
  { key: 'rue', name: 'Rue', role: 'Conditions', color: '#4fd67a', sprite: '🌦️', source: 'desk', settingsKey: 'desk', signal: 'Matchday brief — weather' },
  { key: 'vic', name: 'Vic', role: 'Fitness / Med', color: '#b58bff', sprite: '🩺', source: 'desk', settingsKey: 'desk', signal: 'Matchday brief — injuries' },
  { key: 'ola', name: 'Ola', role: 'Officials Watch', color: '#d0d6e0', sprite: '🟨', source: 'desk', settingsKey: 'desk', signal: 'Matchday brief — referees' },
  { key: 'finn', name: 'Finn', role: 'Fixtures / Travel', color: '#8ad0ff', sprite: '✈️', source: 'desk', settingsKey: 'desk', signal: 'Matchday brief — travel' }
]

// The proactive posters that can be fired on demand (keys match settingsKey).
const RUNNABLE = new Set(['coco', 'sage', 'desk', 'bea'])

function tally(rows, field = 'status') {
  const out = {}
  for (const r of rows) out[r[field]] = (out[r[field]] || 0) + 1
  return out
}

// A short human line from a run-now handler's raw result.
function runSummary(result) {
  if (!result) return 'done'
  if (result.reason === 'disabled') return 'agent is paused — resume it first'
  if (result.reason) return result.reason
  if (result.error) return `error: ${result.error}`
  if (result.proposed || result.briefed) return 'posted ✓'
  if (typeof result.announced === 'number') return result.announced ? `${result.announced} announced` : 'nothing to announce'
  return 'done (nothing to post)'
}

// Per-agent live status derived from the loaded data. Returns { light, line,
// stat } where light is 'live' | 'idle' | 'watch' (drives the LED colour).
function statusFor(agent, data) {
  if (agent.source === 'coco') {
    const rows = data.social
    if (!rows.length) return { light: 'idle', line: 'No posts yet', stat: '—' }
    const c = tally(rows)
    return {
      light: c.pending ? 'live' : 'idle',
      line: `${c.pending || 0} pending · ${c.posted || 0} posted · ${c.rejected || 0} rejected`,
      stat: `${rows.length} total`
    }
  }
  if (agent.source === 'sage') {
    const rows = data.ideas
    if (!rows.length) return { light: 'idle', line: 'No ideas yet', stat: '—' }
    const c = tally(rows)
    return {
      light: c.pending ? 'live' : 'idle',
      line: `${c.pending || 0} pending · ${c.approved || 0} approved · ${c.rejected || 0} rejected`,
      stat: `${rows.length} total`
    }
  }
  if (agent.source === 'coach') {
    const rows = data.picks
    if (!rows.length) return { light: 'idle', line: 'No picks yet', stat: '—' }
    const c = tally(rows, 'result')
    const w = c.won || 0
    const l = c.lost || 0
    return { light: 'live', line: `Record ${w}–${l}${c.void ? ` (${c.void} void)` : ''}`, stat: `${rows.length} picks` }
  }
  // watch / desk: fires server-side, no direct client feed on this screen yet.
  return { light: 'watch', line: 'On watch — fires server-side', stat: '' }
}

function StatusBadge({ status }) {
  return <span className={`hq-badge hq-badge-${status}`}>{status}</span>
}

// Approve / Reject row shown on a still-pending proposal. Wired to the admin
// agent-action endpoint via onAct.
function ProposalActions({ kind, row, onAct, busyId }) {
  if (row.status !== 'pending') return null
  const busy = busyId === row.id
  return (
    <div className="hq-actions">
      <button type="button" className="hq-btn hq-btn-approve" disabled={busy} onClick={() => onAct(kind, row, 'approve')}>
        {busy ? '…' : 'Approve'}
      </button>
      <button type="button" className="hq-btn hq-btn-reject" disabled={busy} onClick={() => onAct(kind, row, 'reject')}>
        Reject
      </button>
    </div>
  )
}

// The detail panel for a selected agent.
function AgentDetail({ agent, data, onAct, busyId }) {
  if (agent.source === 'coco') {
    const rows = data.social.slice(0, 10)
    return (
      <div className="hq-detail-list">
        {!rows.length && <p className="hq-dim">No proposals yet. Coco posts one a day (09:00 UTC).</p>}
        {rows.map((r) => (
          <div key={r.id} className="hq-detail-row">
            <div className="hq-detail-head">
              <StatusBadge status={r.status} />
              <span className="hq-dim">{formatRelativeTime(r.createdAt)}</span>
            </div>
            <div className="hq-detail-body">{r.body}</div>
            {r.error && <div className="hq-detail-err">{r.error}</div>}
            <ProposalActions kind="social" row={r} onAct={onAct} busyId={busyId} />
          </div>
        ))}
      </div>
    )
  }
  if (agent.source === 'sage') {
    const rows = data.ideas.slice(0, 10)
    return (
      <div className="hq-detail-list">
        {!rows.length && <p className="hq-dim">No ideas yet. Sage researches one a day (08:00 UTC).</p>}
        {rows.map((r) => (
          <div key={r.id} className="hq-detail-row">
            <div className="hq-detail-head">
              <StatusBadge status={r.status} />
              <span className="hq-dim">
                {r.sources.length} source{r.sources.length === 1 ? '' : 's'} · {formatRelativeTime(r.createdAt)}
              </span>
            </div>
            <div className="hq-detail-body">{r.body}</div>
            {r.issueUrl && (
              <a className="hq-detail-link" href={r.issueUrl} target="_blank" rel="noreferrer">
                View issue ↗
              </a>
            )}
            <ProposalActions kind="idea" row={r} onAct={onAct} busyId={busyId} />
          </div>
        ))}
      </div>
    )
  }
  if (agent.source === 'coach') {
    const rows = data.picks.slice(0, 12)
    return (
      <div className="hq-detail-list">
        {!rows.length && <p className="hq-dim">No graded picks yet.</p>}
        {rows.map((r) => (
          <div key={r.id} className="hq-detail-row">
            <div className="hq-detail-head">
              <StatusBadge status={r.result || 'open'} />
              <span className="hq-dim">{r.pickDate}</span>
            </div>
            {r.reply && <div className="hq-detail-body">{r.reply}</div>}
          </div>
        ))}
      </div>
    )
  }
  // watch / desk agents
  return (
    <div className="hq-detail-list">
      <p className="hq-dim">
        {agent.name} runs on a schedule server-side and posts to Discord when there's something to say
        {agent.signal ? ` — ${agent.signal.toLowerCase()}` : ''}. A live feed for this agent lands in a later
        phase (it needs a secure admin read on its data). For now it's armed and on watch.
      </p>
    </div>
  )
}

export default function AgentHqPage() {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [selectedKey, setSelectedKey] = useState('coco')
  const [busyId, setBusyId] = useState(null)
  const [notice, setNotice] = useState(null)
  const [settings, setSettings] = useState([])
  const [savingKey, setSavingKey] = useState(null)
  const [runningKey, setRunningKey] = useState(null)

  // Reload the live data (used after a "Run now" so a fresh proposal appears).
  async function reloadData() {
    const [social, ideas, picks] = await Promise.all([dataStore.listSocialPosts(), dataStore.listIdeaProposals(), dataStore.listCoachDailyPicks()])
    setData({ social, ideas, picks })
  }

  // Fire a poster agent on demand, then refresh so any new proposal shows.
  async function handleRun(key) {
    setRunningKey(key)
    setNotice(null)
    try {
      const res = await dataStore.agentRun(key)
      setNotice(`Ran — ${runSummary(res.result)}`)
      await reloadData().catch(() => {})
    } catch (err) {
      // A slow poster (Sage/desk call Claude) can outlast the request; the run
      // may still have completed, so say so rather than implying failure.
      setNotice(`Kicked off — ${err.message}. If it was slow, check back in a moment.`)
    } finally {
      setRunningKey(null)
    }
  }

  // Default-enabled; only an explicit false disables (mirrors agentSettings.js).
  const enabledOf = (key) => {
    const row = settings.find((s) => s.key === key)
    return !row || row.enabled !== false
  }

  // Approve/reject a proposal, then reflect the returned status in place.
  async function handleAct(kind, row, action) {
    setBusyId(row.id)
    setNotice(null)
    try {
      const res = await dataStore.agentAction({ kind, id: row.id, action })
      const listKey = kind === 'social' ? 'social' : 'ideas'
      setData((d) => (d ? { ...d, [listKey]: d[listKey].map((r) => (r.id === row.id ? { ...r, status: res.status || r.status } : r)) } : d))
      setNotice(res.message || 'Done.')
    } catch (err) {
      setNotice(`Couldn't ${action}: ${err.message}`)
    } finally {
      setBusyId(null)
    }
  }

  // Pause/resume an agent (agent_settings). Optimistically updates the flag.
  async function handleToggle(key, next) {
    setSavingKey(key)
    setNotice(null)
    try {
      await dataStore.setAgentEnabled(key, next)
      setSettings((list) => {
        const rest = list.filter((s) => s.key !== key)
        return [...rest, { key, enabled: next }]
      })
      setNotice(next ? 'Agent resumed.' : 'Agent paused.')
    } catch (err) {
      setNotice(`Couldn't update: ${err.message}`)
    } finally {
      setSavingKey(null)
    }
  }

  useEffect(() => {
    if (!user.isAdmin) return
    let alive = true
    Promise.all([dataStore.listSocialPosts(), dataStore.listIdeaProposals(), dataStore.listCoachDailyPicks()])
      .then(([social, ideas, picks]) => {
        if (alive) setData({ social, ideas, picks })
      })
      .catch((err) => alive && setError(err.message))
    // Loaded separately and fail-soft: if agent_settings isn't applied yet the
    // page still works (every agent just shows as enabled).
    dataStore
      .listAgentSettings()
      .then((s) => alive && setSettings(s))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [user.isAdmin])

  const statuses = useMemo(() => {
    if (!data) return {}
    return Object.fromEntries(AGENTS.map((a) => [a.key, statusFor(a, data)]))
  }, [data])

  if (!user.isAdmin) return <Navigate to="/odds" replace />

  const selected = AGENTS.find((a) => a.key === selectedKey) || AGENTS[0]

  return (
    <div className="hq">
      <div className="topbar">
        <Link to="/account" className="back">
          &larr; Account
        </Link>
        <h1>Agent HQ</h1>
      </div>

      {error && <div className="error">Couldn't load agent status: {error}</div>}
      {!error && !data && <div className="loading">Booting the control room…</div>}

      {data && (
        <>
          <p className="hq-sub">
            Your live agent ecosystem. Each room shows real status from the database — click a room for detail,
            pause an agent, or approve/reject its proposals.
          </p>

          <div className="hq-grid">
            {AGENTS.map((a) => {
              const s = statuses[a.key]
              const paused = !enabledOf(a.settingsKey)
              return (
                <button
                  key={a.key}
                  type="button"
                  className={`hq-room${a.key === selectedKey ? ' selected' : ''}${paused ? ' paused' : ''}`}
                  style={{ '--agent': a.color }}
                  onClick={() => setSelectedKey(a.key)}
                >
                  <span className={`hq-led hq-led-${paused ? 'off' : s.light}`} aria-hidden="true" />
                  {paused && <span className="hq-paused-tag">paused</span>}
                  <span className="hq-sprite" aria-hidden="true">
                    {a.sprite}
                  </span>
                  <span className="hq-room-name">{a.name}</span>
                  <span className="hq-room-role">{a.role}</span>
                  <span className="hq-room-line">{s.line}</span>
                  {s.stat && <span className="hq-room-stat">{s.stat}</span>}
                </button>
              )
            })}
          </div>

          <div className="hq-panel" style={{ '--agent': selected.color }}>
            <div className="hq-panel-head">
              <span className="hq-sprite hq-sprite-lg" aria-hidden="true">
                {selected.sprite}
              </span>
              <div className="hq-panel-title">
                <div className="hq-panel-name">
                  {selected.name} <span className="hq-dim">· {selected.role}</span>
                </div>
                {selected.signal && <div className="hq-panel-signal">{selected.signal}</div>}
              </div>
              <div className="hq-panel-controls">
                {RUNNABLE.has(selected.settingsKey) && (
                  <button
                    type="button"
                    className="hq-btn hq-btn-run"
                    disabled={runningKey === selected.settingsKey || !enabledOf(selected.settingsKey)}
                    onClick={() => handleRun(selected.settingsKey)}
                    title={enabledOf(selected.settingsKey) ? 'Run this agent now' : 'Resume the agent first'}
                  >
                    {runningKey === selected.settingsKey ? 'Running…' : '▶ Run now'}
                  </button>
                )}
                <button
                  type="button"
                  className={`hq-switch${enabledOf(selected.settingsKey) ? ' on' : ''}`}
                  disabled={savingKey === selected.settingsKey}
                  onClick={() => handleToggle(selected.settingsKey, !enabledOf(selected.settingsKey))}
                  aria-pressed={enabledOf(selected.settingsKey)}
                  title={enabledOf(selected.settingsKey) ? 'Pause this agent' : 'Resume this agent'}
                >
                  <span className="hq-switch-track" aria-hidden="true">
                    <span className="hq-switch-knob" />
                  </span>
                  {enabledOf(selected.settingsKey) ? 'On' : 'Paused'}
                </button>
              </div>
            </div>
            {notice && <div className="hq-notice">{notice}</div>}
            <AgentDetail agent={selected} data={data} onAct={handleAct} busyId={busyId} />
          </div>
        </>
      )}
    </div>
  )
}
