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

// The cast, their colours (from the BetMates Ops sim), and where each one's
// status comes from. `source: 'live'` agents read a real table; 'watch' agents
// fire server-side with no client feed on this screen yet.
const AGENTS = [
  { key: 'coco', name: 'Coco', role: 'Social Media Mgr', color: '#ff77b6', sprite: '📣', source: 'coco', signal: 'Daily promo post → approve → X' },
  { key: 'sage', name: 'Sage', role: 'Ideas / R&D', color: '#ffce4d', sprite: '💡', source: 'sage', signal: 'Fact-checked idea → approve → GitHub' },
  { key: 'coach', name: 'CoachGPT', role: 'The Coach', color: '#c9a6ff', sprite: '🧠', source: 'coach', signal: 'Daily pick, graded' },
  { key: 'dex', name: 'Dex', role: 'Data Engineer', color: '#5c97ff', sprite: '🛠️', source: 'watch', signal: 'Settlement + CI alerts' },
  { key: 'mira', name: 'Mira', role: 'Odds Analyst', color: '#37e0d6', sprite: '🔔', source: 'watch', signal: 'Odds-alert hits' },
  { key: 'nova', name: 'Nova', role: 'Markets Trader', color: '#37e0a0', sprite: '📈', source: 'watch', signal: 'Sharp-money moves' },
  { key: 'priya', name: 'Priya', role: 'Compliance', color: '#ff6a5d', sprite: '⚠️', source: 'watch', signal: 'Spend-limit escalations' },
  { key: 'bea', name: 'Bea', role: 'Community', color: '#ffa24d', sprite: '🎉', source: 'watch', signal: 'Group member milestones' },
  { key: 'jonas', name: 'Jonas', role: 'Form Scout', color: '#ff9a4d', sprite: '📋', source: 'desk', signal: 'Matchday brief — form' },
  { key: 'rue', name: 'Rue', role: 'Conditions', color: '#4fd67a', sprite: '🌦️', source: 'desk', signal: 'Matchday brief — weather' },
  { key: 'vic', name: 'Vic', role: 'Fitness / Med', color: '#b58bff', sprite: '🩺', source: 'desk', signal: 'Matchday brief — injuries' },
  { key: 'ola', name: 'Ola', role: 'Officials Watch', color: '#d0d6e0', sprite: '🟨', source: 'desk', signal: 'Matchday brief — referees' },
  { key: 'finn', name: 'Finn', role: 'Fixtures / Travel', color: '#8ad0ff', sprite: '✈️', source: 'desk', signal: 'Matchday brief — travel' }
]

function tally(rows, field = 'status') {
  const out = {}
  for (const r of rows) out[r[field]] = (out[r[field]] || 0) + 1
  return out
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

  useEffect(() => {
    if (!user.isAdmin) return
    let alive = true
    Promise.all([dataStore.listSocialPosts(), dataStore.listIdeaProposals(), dataStore.listCoachDailyPicks()])
      .then(([social, ideas, picks]) => {
        if (alive) setData({ social, ideas, picks })
      })
      .catch((err) => alive && setError(err.message))
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
            Your live agent ecosystem. Each room shows real status pulled from the database. Click a room for detail.
            <span className="hq-dim"> (Read-only for now — controls come next.)</span>
          </p>

          <div className="hq-grid">
            {AGENTS.map((a) => {
              const s = statuses[a.key]
              return (
                <button
                  key={a.key}
                  type="button"
                  className={`hq-room${a.key === selectedKey ? ' selected' : ''}`}
                  style={{ '--agent': a.color }}
                  onClick={() => setSelectedKey(a.key)}
                >
                  <span className={`hq-led hq-led-${s.light}`} aria-hidden="true" />
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
              <div>
                <div className="hq-panel-name">
                  {selected.name} <span className="hq-dim">· {selected.role}</span>
                </div>
                {selected.signal && <div className="hq-panel-signal">{selected.signal}</div>}
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
