import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import * as dataStore from '../lib/dataStore.js'
import { formatRelativeTime } from '../utils/format.js'

// Agent HQ - a live, admin-only control room for the scheduled "agent"
// ecosystem. Every agent is a real background function; this room shows each
// one's live data and lets you control it.
//
// Three data sources feed the room:
//   - Coco/Sage/CoachGPT read their own RLS-readable tables straight from the
//     client (social_posts / idea_proposals / coach_daily_picks).
//   - Dex/Mira/Nova/Priya/Bea fire against tables the anon key can't read, so
//     their live feed comes from the admin-verified /api/agent-hq-feed endpoint.
//   - agent_settings drives the pause/resume switch (fail-open: no row = on).
//
// Each agent tile shows what it's DOING (recent real events), what it's WATCHING
// (the live inputs it acts on) and its HEALTH (paused state, last activity, and
// which integration keys are configured). Controls: approve/reject a proposal,
// pause/resume, run-now, and a manual refresh (the feed also auto-polls).
//
// Gating mirrors the other admin pages: the redirect is UX only; the real
// enforcement is RLS + the endpoint's server-side is_admin check.

const AGENTS = [
  { key: 'coco', name: 'Coco', role: 'Social Media Mgr', color: '#ff77b6', sprite: '📣', source: 'coco', settingsKey: 'coco', signal: 'Daily promo post → approve → X' },
  { key: 'sage', name: 'Sage', role: 'Research & Ideas', color: '#ffce4d', sprite: '💡', source: 'sage', settingsKey: 'sage', signal: 'Ideas from the web + the site → approve → GitHub' },
  { key: 'coach', name: 'CoachGPT', role: 'The Coach', color: '#c9a6ff', sprite: '🧠', source: 'coach', settingsKey: 'coach', signal: 'Daily pick, graded' },
  { key: 'dex', name: 'Dex', role: 'Data Engineer', color: '#5c97ff', sprite: '🛠️', source: 'dex', settingsKey: 'dex', signal: 'Settles bets + CI alerts' },
  { key: 'mira', name: 'Mira', role: 'Odds Analyst', color: '#37e0d6', sprite: '🔔', source: 'mira', settingsKey: 'mira', signal: 'Odds-alert hits' },
  { key: 'nova', name: 'Nova', role: 'Markets Trader', color: '#37e0a0', sprite: '📈', source: 'nova', settingsKey: 'nova', signal: 'Sharp-money moves' },
  { key: 'priya', name: 'Priya', role: 'Compliance', color: '#ff6a5d', sprite: '⚠️', source: 'priya', settingsKey: 'priya', signal: 'Spend-limit escalations' },
  { key: 'bea', name: 'Bea', role: 'Community', color: '#ffa24d', sprite: '🎉', source: 'bea', settingsKey: 'bea', signal: 'Group member milestones' }
]

// The proactive posters that can be fired on demand (keys match settingsKey).
const RUNNABLE = new Set(['coco', 'sage', 'bea'])
const WATCH = new Set(['dex', 'mira', 'nova', 'priya', 'bea'])
const REFRESH_MS = 45000
const RECENT_MS = 3 * 24 * 60 * 60 * 1000

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

// Normalise every agent to one shape: { doing:[{when,text,tone}], watching:
// [{label,value}], lastActivity }. Coco/Sage/Coach are derived from their
// client-read rows; the five watch agents come straight from the endpoint feed.
function feedFor(agent, data) {
  if (WATCH.has(agent.key)) return data.feeds[agent.key] || { doing: [], watching: [], lastActivity: null }

  if (agent.source === 'coco') {
    const rows = data.social
    const c = tally(rows)
    return {
      doing: rows.slice(0, 8).map((r) => ({
        when: r.postedAt || r.createdAt,
        text: r.status === 'posted' ? 'Posted a promo to X' : r.status === 'pending' ? 'Drafted a promo post' : `Promo ${r.status}`,
        tone: r.status === 'posted' ? 'ok' : r.status === 'rejected' || r.status === 'failed' ? 'bad' : 'info'
      })),
      watching: [{ label: 'Pending your approval', value: c.pending || 0 }],
      lastActivity: rows[0]?.createdAt || null
    }
  }
  if (agent.source === 'sage') {
    const rows = data.ideas
    const c = tally(rows)
    return {
      doing: rows.slice(0, 8).map((r) => ({
        when: r.createdAt,
        text: r.status === 'approved' ? 'Idea approved' : r.status === 'rejected' ? 'Idea rejected' : 'Proposed an idea',
        tone: r.status === 'approved' ? 'ok' : r.status === 'rejected' ? 'bad' : 'info'
      })),
      watching: [{ label: 'Pending your approval', value: c.pending || 0 }],
      lastActivity: rows[0]?.createdAt || null
    }
  }
  // coach
  const rows = data.picks
  return {
    doing: rows.slice(0, 8).map((r) => ({
      when: r.settledAt || r.createdAt,
      text: r.result ? `Pick graded — ${r.result}` : 'Pick locked in',
      tone: r.result === 'won' ? 'ok' : r.result === 'lost' ? 'bad' : 'info'
    })),
    watching: [{ label: 'Open picks', value: rows.filter((r) => !r.result).length }],
    lastActivity: rows[0]?.settledAt || rows[0]?.createdAt || null
  }
}

// LED / pill state from paused flag + feed recency.
function lightFor(paused, feed) {
  if (paused) return 'off'
  const recent = feed.lastActivity ? Date.now() - Date.parse(feed.lastActivity) < RECENT_MS : feed.doing.length > 0
  return recent ? 'live' : 'idle'
}
function pillLabel(light) {
  return light === 'off' ? 'paused' : light
}

function ToneDot({ tone }) {
  return <span className={`hq-tone hq-tone-${tone || 'info'}`} aria-hidden="true" />
}

function HealthDots({ health }) {
  if (!health.length) return null
  return (
    <span className="hq-health-dots" aria-hidden="true">
      {health.map((h) => (
        <span key={h.name} className={`hq-hdot${h.ok ? ' ok' : ''}`} title={`${h.name}: ${h.ok ? 'configured' : 'not configured'}`} />
      ))}
    </span>
  )
}

function StatusBadge({ status }) {
  return <span className={`hq-badge hq-badge-${status}`}>{status}</span>
}

// Approve / Reject row shown on a still-pending proposal.
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

// DOING / WATCHING / HEALTH — the live-feed readout shared by every agent.
function LiveReadout({ agent, feed, health }) {
  return (
    <>
      {health.length > 0 && (
        <div className="hq-readout">
          <div className="hq-readout-label">Health</div>
          <div className="hq-chips">
            {health.map((h) => (
              <span key={h.name} className={`hq-chip${h.ok ? ' ok' : ' off'}`}>
                <span className="hq-chip-dot" aria-hidden="true" />
                {h.name}
                <span className="hq-chip-state">{h.ok ? 'ready' : 'not set'}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="hq-readout">
        <div className="hq-readout-label">
          Watching <span className="hq-dim">— live inputs {agent.name} acts on</span>
        </div>
        {feed.watching.length ? (
          <div className="hq-metrics">
            {feed.watching.map((m) => (
              <div key={m.label} className="hq-metric">
                <span className="hq-metric-value">{m.value}</span>
                <span className="hq-metric-label">{m.label}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="hq-dim">No live inputs right now.</p>
        )}
      </div>

      <div className="hq-readout">
        <div className="hq-readout-label">
          Doing <span className="hq-dim">— recent real activity</span>
        </div>
        {feed.doing.length ? (
          <ul className="hq-events">
            {feed.doing.map((e, i) => (
              <li key={i} className="hq-event">
                <ToneDot tone={e.tone} />
                <span className="hq-event-text">{e.text}</span>
                {e.when && <span className="hq-event-when">{formatRelativeTime(e.when)}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="hq-dim">
            {WATCH.has(agent.key)
              ? 'No activity yet — armed and on watch. It fires server-side and posts to Discord when there’s something to report.'
              : 'No activity yet.'}
          </p>
        )}
      </div>
    </>
  )
}

// Proposal / pick lists for the three client-read agents (with approve/reject).
function ProposalList({ agent, data, onAct, busyId }) {
  if (agent.source === 'coco') {
    const rows = data.social.slice(0, 10)
    if (!rows.length) return null
    return (
      <div className="hq-readout">
        <div className="hq-readout-label">Proposals</div>
        <div className="hq-detail-list">
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
      </div>
    )
  }
  if (agent.source === 'sage') {
    const rows = data.ideas.slice(0, 10)
    if (!rows.length) return null
    return (
      <div className="hq-readout">
        <div className="hq-readout-label">Proposals</div>
        <div className="hq-detail-list">
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
      </div>
    )
  }
  if (agent.source === 'coach') {
    const rows = data.picks.slice(0, 12)
    if (!rows.length) return null
    return (
      <div className="hq-readout">
        <div className="hq-readout-label">Graded picks</div>
        <div className="hq-detail-list">
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
      </div>
    )
  }
  return null
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
  const [refreshing, setRefreshing] = useState(false)
  const [updatedAt, setUpdatedAt] = useState(null)
  const timerRef = useRef(null)

  // Load everything the room needs in parallel. The feed is fail-soft (an empty
  // feed just means the watch agents show no live signal), same for settings.
  const load = useCallback(async () => {
    const [social, ideas, picks, feed] = await Promise.all([
      dataStore.listSocialPosts(),
      dataStore.listIdeaProposals(),
      dataStore.listCoachDailyPicks(),
      dataStore.getAgentHqFeed().catch(() => ({ feeds: {}, health: {} }))
    ])
    setData({ social, ideas, picks, feeds: feed.feeds || {}, health: feed.health || {} })
    setUpdatedAt(Date.now())
  }, [])

  async function refresh() {
    setRefreshing(true)
    setNotice(null)
    try {
      await load()
    } catch (err) {
      setNotice(`Couldn't refresh: ${err.message}`)
    } finally {
      setRefreshing(false)
    }
  }

  // Fire a poster agent on demand, then refresh so any new proposal shows.
  async function handleRun(key) {
    setRunningKey(key)
    setNotice(null)
    try {
      const res = await dataStore.agentRun(key)
      setNotice(`Ran — ${runSummary(res.result)}`)
      await load().catch(() => {})
    } catch (err) {
      // A slow poster (Sage calls Claude) can outlast the request; the run may
      // still have completed, so say so rather than implying failure.
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
    if (!user.isAdmin) return undefined
    let alive = true
    load().catch((err) => alive && setError(err.message))
    dataStore
      .listAgentSettings()
      .then((s) => alive && setSettings(s))
      .catch(() => {})
    // Light auto-poll so the room stays live without a manual refresh.
    timerRef.current = setInterval(() => {
      load().catch(() => {})
    }, REFRESH_MS)
    return () => {
      alive = false
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [user.isAdmin, load])

  const feeds = useMemo(() => {
    if (!data) return {}
    return Object.fromEntries(AGENTS.map((a) => [a.key, feedFor(a, data)]))
  }, [data])

  // HUD roll-up across the whole room.
  const hud = useMemo(() => {
    if (!data) return null
    let live = 0
    let paused = 0
    let pending = 0
    for (const a of AGENTS) {
      const isPaused = !enabledOf(a.settingsKey)
      if (isPaused) paused += 1
      else if (lightFor(false, feeds[a.key]) === 'live') live += 1
    }
    pending = (data.social || []).filter((r) => r.status === 'pending').length + (data.ideas || []).filter((r) => r.status === 'pending').length
    const dexWatch = feeds.dex?.watching?.[0]?.value ?? '—'
    const miraWatch = feeds.mira?.watching?.[0]?.value ?? '—'
    return { live, paused, pending, openBets: dexWatch, armedAlerts: miraWatch }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, feeds, settings])

  if (!user.isAdmin) return <Navigate to="/odds" replace />

  const selected = AGENTS.find((a) => a.key === selectedKey) || AGENTS[0]
  const selFeed = data ? feeds[selected.key] : { doing: [], watching: [], lastActivity: null }
  const selHealth = (data && data.health[selected.key]) || []

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
          <div className="hq-hud">
            <div className="hq-hud-stats">
              <span className="hq-hud-stat">
                <b className="hq-hud-live">{hud.live}</b> live
              </span>
              <span className="hq-hud-stat">
                <b>{hud.paused}</b> paused
              </span>
              <span className="hq-hud-stat">
                <b className={hud.pending ? 'hq-hud-hot' : ''}>{hud.pending}</b> awaiting approval
              </span>
              <span className="hq-hud-stat">
                <b>{hud.openBets}</b> open bets
              </span>
              <span className="hq-hud-stat">
                <b>{hud.armedAlerts}</b> armed alerts
              </span>
            </div>
            <div className="hq-hud-right">
              {updatedAt && <span className="hq-hud-ts">updated {formatRelativeTime(new Date(updatedAt).toISOString())}</span>}
              <button type="button" className="hq-btn hq-btn-refresh" onClick={refresh} disabled={refreshing}>
                {refreshing ? '…' : '↻ Refresh'}
              </button>
            </div>
          </div>

          <p className="hq-sub">
            Your live agent ecosystem. Each tile shows what a robot is <b>doing</b>, what it's <b>watching</b>, and its{' '}
            <b>health</b> — all from real data. Click one to control it.
          </p>

          <div className="hq-grid">
            {AGENTS.map((a) => {
              const feed = feeds[a.key]
              const paused = !enabledOf(a.settingsKey)
              const light = lightFor(paused, feed)
              const health = data.health[a.key] || []
              const doing = feed.doing[0]
              const watch = feed.watching[0]
              return (
                <button
                  key={a.key}
                  type="button"
                  className={`hq-tile${a.key === selectedKey ? ' selected' : ''}${paused ? ' paused' : ''}`}
                  style={{ '--agent': a.color }}
                  onClick={() => setSelectedKey(a.key)}
                >
                  <span className="hq-tile-top">
                    <span className="hq-sprite" aria-hidden="true">
                      {a.sprite}
                    </span>
                    <span className={`hq-pill hq-pill-${light}`}>
                      <span className={`hq-led hq-led-${light}`} aria-hidden="true" />
                      {pillLabel(light)}
                    </span>
                  </span>
                  <span className="hq-tile-name">{a.name}</span>
                  <span className="hq-tile-role">{a.role}</span>
                  <span className="hq-tile-line">{doing ? doing.text : watch ? `${watch.label}: ${watch.value}` : 'On watch — no live signal'}</span>
                  <span className="hq-tile-foot">
                    {watch && (
                      <span className="hq-tile-stat">
                        <b>{watch.value}</b> {watch.label.toLowerCase()}
                      </span>
                    )}
                    <HealthDots health={health} />
                  </span>
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
                {selFeed.lastActivity && <div className="hq-panel-last">last activity {formatRelativeTime(selFeed.lastActivity)}</div>}
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
            <LiveReadout agent={selected} feed={selFeed} health={selHealth} />
            <ProposalList agent={selected} data={data} onAct={handleAct} busyId={busyId} />
          </div>
        </>
      )}
    </div>
  )
}
