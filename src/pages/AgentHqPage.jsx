import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import * as dataStore from '../lib/dataStore.js'
import { formatRelativeTime, formatKickoff, formatCountdown } from '../utils/format.js'
import { POST_SPORTS, POST_SUBJECTS } from '../lib/socialDraft.js'
import { fetchFixtures } from '../api/oddsClient.js'
import { fetchFights } from '../api/ufcClient.js'
import { fetchRaces, fetchRaceResults } from '../api/racingClient.js'
import { fetchResults } from '../api/resultsClient.js'

// BetMates Ops — the admin command deck. One screen to run BetMates while you're
// away: POST a promo with one tap (or compose one), scan RECENT SPORTS, and
// check in on the BOTS. Everything here is real: posts publish to X, the sports
// panels read the live odds/results feed, and the robot bays show and control
// the actual background agents. Route /admin/agents; admin-gated (UX redirect +
// server-side is_admin on every endpoint).

// ============================================================ POST STUDIO
function PostStudio() {
  const [sport, setSport] = useState('football')
  const [subject, setSubject] = useState('hype')
  const [draft, setDraft] = useState(null)
  const [busy, setBusy] = useState(null) // 'now' | 'draft' | 'post'
  const [result, setResult] = useState(null)

  async function run(mode) {
    setBusy(mode === 'daily' ? 'now' : mode === 'preview' ? 'draft' : 'post')
    setResult(null)
    try {
      const res = await dataStore.composePost({ mode, sport, subject })
      if (mode === 'preview') {
        setDraft(res.body || '')
      } else {
        setDraft(res.body || draft)
        setResult({
          tone: res.posted ? 'ok' : res.skipped ? 'warn' : 'bad',
          text: res.message || (res.posted ? 'Posted to X ✓' : 'Done'),
          link: res.link || null
        })
      }
    } catch (err) {
      setResult({ tone: 'bad', text: err.message })
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="deck-card deck-post">
      <div className="deck-card-head">
        <span className="deck-bot deck-bot-sm" style={{ '--c': '#ff77b6' }} aria-hidden="true">
          <span className="deck-bot-head">
            <span className="deck-bot-visor" />
          </span>
          <span className="deck-bot-body" />
        </span>
        <div>
          <h2 className="deck-card-title">Post</h2>
          <p className="deck-card-sub">Coco publishes to X — one tap, or compose your own.</p>
        </div>
        <button type="button" className="deck-postnow" disabled={!!busy} onClick={() => run('daily')}>
          {busy === 'now' ? 'Posting…' : '⚡ Post now'}
        </button>
      </div>

      <div className="deck-studio">
        <div className="deck-field">
          <label className="deck-label" htmlFor="deck-sport">
            Sport
          </label>
          <select id="deck-sport" className="deck-select" value={sport} onChange={(e) => setSport(e.target.value)}>
            {POST_SPORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.emoji} {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className="deck-field">
          <label className="deck-label" htmlFor="deck-subject">
            Subject
          </label>
          <select id="deck-subject" className="deck-select" value={subject} onChange={(e) => setSubject(e.target.value)}>
            {POST_SUBJECTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="deck-btn" disabled={!!busy} onClick={() => run('preview')}>
          {busy === 'draft' ? 'Drafting…' : 'Draft it'}
        </button>
      </div>

      {draft != null && (
        <div className="deck-draft">
          <div className="deck-draft-body">{draft || 'No draft.'}</div>
          <div className="deck-draft-foot">
            <span className="deck-draft-count">{draft.length}/280</span>
            <button type="button" className="deck-btn deck-btn-go" disabled={!!busy || !draft} onClick={() => run('post')}>
              {busy === 'post' ? 'Posting…' : 'Post to X'}
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className={`deck-result deck-result-${result.tone}`}>
          {result.text}
          {result.link && (
            <a href={result.link} target="_blank" rel="noreferrer">
              {' '}
              view ↗
            </a>
          )}
        </div>
      )}
    </section>
  )
}

// ============================================================ SPORTS PANEL
const SPORT_TABS = [
  { key: 'football', label: 'Football', emoji: '⚽' },
  { key: 'ufc', label: 'UFC', emoji: '🥊' },
  { key: 'racing', label: 'Racing', emoji: '🏇' }
]

function fixtureTitle(item, sport) {
  if (sport === 'racing') return `${item.course} — ${item.raceName}`
  if (sport === 'ufc') return `${item.fighterA} v ${item.fighterB}`
  return `${item.homeTeam} v ${item.awayTeam}`
}
function h2hOutcomes(item) {
  const m = (item.markets || []).find((x) => x.key === 'h2h')
  if (!m) return []
  return (m.outcomes || []).map((o) => ({ name: o.name, decimal: o.bestOdds?.decimal ?? o.allOdds?.[0]?.decimal ?? null }))
}
function resultTitle(r, sport) {
  if (sport === 'racing') return `${r.course} — ${r.raceName}`
  return `${r.homeTeam} v ${r.awayTeam}`
}

function SportsPanel() {
  const [tab, setTab] = useState('football')
  const [view, setView] = useState('fixtures') // 'fixtures' | 'results'
  const [items, setItems] = useState(null)
  const [loadedFor, setLoadedFor] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    setItems(null)
    setError(null)
    const token = `${tab}:${view}`
    const fetcher = () => {
      if (view === 'results') return tab === 'racing' ? fetchRaceResults() : fetchResults(tab)
      if (tab === 'football') return fetchFixtures()
      if (tab === 'ufc') return fetchFights()
      return fetchRaces()
    }
    fetcher()
      .then((data) => {
        if (!alive) return
        setItems(Array.isArray(data) ? data.slice(0, 6) : [])
        setLoadedFor(token)
      })
      .catch((err) => alive && setError(err.message))
    return () => {
      alive = false
    }
  }, [tab, view])

  const ready = loadedFor === `${tab}:${view}` ? items : null

  return (
    <section className="deck-card deck-sports">
      <div className="deck-card-head">
        <div>
          <h2 className="deck-card-title">Recent sports</h2>
          <p className="deck-card-sub">Live odds and results — {SPORT_TABS.find((s) => s.key === tab)?.label}.</p>
        </div>
        <div className="deck-toggle">
          <button type="button" className={view === 'fixtures' ? 'on' : ''} onClick={() => setView('fixtures')}>
            Upcoming
          </button>
          <button type="button" className={view === 'results' ? 'on' : ''} onClick={() => setView('results')}>
            Results
          </button>
        </div>
      </div>

      <div className="deck-tabs">
        {SPORT_TABS.map((s) => (
          <button key={s.key} type="button" className={`deck-tab${tab === s.key ? ' on' : ''}`} onClick={() => setTab(s.key)}>
            {s.emoji} {s.label}
          </button>
        ))}
      </div>

      {error && <p className="deck-dim">Couldn’t load: {error}</p>}
      {!error && !ready && <p className="deck-dim">Loading…</p>}
      {ready && ready.length === 0 && <p className="deck-dim">Nothing to show right now.</p>}

      {ready && ready.length > 0 && (
        <ul className="deck-fixtures">
          {view === 'fixtures'
            ? ready.map((item) => (
                <li key={item.id} className="deck-fixture">
                  <div className="deck-fixture-main">
                    <span className="deck-fixture-title">{fixtureTitle(item, tab)}</span>
                    <span className="deck-fixture-when">
                      {tab === 'racing'
                        ? formatKickoff(item.offTime)
                        : `${formatKickoff(item.kickoff)} · ${formatCountdown(item.kickoff)}`}
                    </span>
                  </div>
                  {tab === 'racing' ? (
                    <span className="deck-odds-chip">{(item.runners || []).length} runners</span>
                  ) : (
                    <div className="deck-odds">
                      {h2hOutcomes(item).map((o, i) => (
                        <span key={i} className="deck-odds-chip">
                          {o.name} <b>{o.decimal ? o.decimal.toFixed(2) : '—'}</b>
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              ))
            : ready.map((r, idx) => (
                <li key={r.raceId || r.id || idx} className="deck-fixture">
                  <div className="deck-fixture-main">
                    <span className="deck-fixture-title">{resultTitle(r, tab)}</span>
                    {tab === 'racing' && <span className="deck-fixture-when">{formatKickoff(r.offTime)}</span>}
                  </div>
                  {tab === 'racing' ? (
                    <span className="deck-odds-chip">
                      🥇 {(r.runners || []).find((x) => x.position === 1)?.name || 'result in'}
                    </span>
                  ) : (
                    <span className="deck-score">{(r.scores || []).map((s) => s.score).join(' – ') || 'FT'}</span>
                  )}
                </li>
              ))}
        </ul>
      )}
    </section>
  )
}

// ============================================================ BOT DECK
const AGENTS = [
  { key: 'coco', name: 'Coco', role: 'Social', color: '#ff77b6', source: 'coco', settingsKey: 'coco', signal: 'Daily promo → X' },
  { key: 'sage', name: 'Sage', role: 'Research', color: '#ffce4d', source: 'sage', settingsKey: 'sage', signal: 'Ideas from web + site → GitHub' },
  { key: 'coach', name: 'CoachGPT', role: 'The Coach', color: '#c9a6ff', source: 'coach', settingsKey: 'coach', signal: 'Daily pick, graded' },
  { key: 'dex', name: 'Dex', role: 'Data', color: '#5c97ff', source: 'dex', settingsKey: 'dex', signal: 'Settles bets + CI' },
  { key: 'mira', name: 'Mira', role: 'Odds', color: '#37e0d6', source: 'mira', settingsKey: 'mira', signal: 'Odds-alert hits' },
  { key: 'nova', name: 'Nova', role: 'Markets', color: '#37e0a0', source: 'nova', settingsKey: 'nova', signal: 'Sharp-money moves' },
  { key: 'priya', name: 'Priya', role: 'Compliance', color: '#ff6a5d', source: 'priya', settingsKey: 'priya', signal: 'Spend-limit alerts' },
  { key: 'bea', name: 'Bea', role: 'Community', color: '#ffa24d', source: 'bea', settingsKey: 'bea', signal: 'Group milestones' }
]
const RUNNABLE = new Set(['coco', 'sage', 'bea'])
const WATCH = new Set(['dex', 'mira', 'nova', 'priya', 'bea'])
const REFRESH_MS = 45000
const RECENT_MS = 3 * 24 * 60 * 60 * 1000

function tally(rows, field = 'status') {
  const out = {}
  for (const r of rows) out[r[field]] = (out[r[field]] || 0) + 1
  return out
}
function runSummary(result) {
  if (!result) return 'done'
  if (result.reason === 'disabled') return 'agent is paused — resume it first'
  if (result.reason) return result.reason
  if (result.error) return `error: ${result.error}`
  if (result.proposed || result.briefed) return 'posted ✓'
  if (typeof result.announced === 'number') return result.announced ? `${result.announced} announced` : 'nothing to announce'
  return 'done'
}

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
function lightFor(paused, feed) {
  if (paused) return 'off'
  const recent = feed.lastActivity ? Date.now() - Date.parse(feed.lastActivity) < RECENT_MS : feed.doing.length > 0
  return recent ? 'live' : 'idle'
}

function Robot({ color, light }) {
  return (
    <span className={`deck-bot deck-bot-${light}`} style={{ '--c': color }} aria-hidden="true">
      <span className="deck-bot-head">
        <span className="deck-bot-visor" />
      </span>
      <span className="deck-bot-body" />
      <span className="deck-bot-arm l" />
      <span className="deck-bot-arm r" />
    </span>
  )
}
function ToneDot({ tone }) {
  return <span className={`hq-tone hq-tone-${tone || 'info'}`} aria-hidden="true" />
}
function StatusBadge({ status }) {
  return <span className={`hq-badge hq-badge-${status}`}>{status}</span>
}
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
              ? 'No activity yet — armed and on watch. Fires server-side and posts to Discord when there’s something to report.'
              : 'No activity yet.'}
          </p>
        )}
      </div>
    </>
  )
}
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

function BotDeck() {
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
  async function handleRun(key) {
    setRunningKey(key)
    setNotice(null)
    try {
      const res = await dataStore.agentRun(key)
      setNotice(`Ran — ${runSummary(res.result)}`)
      await load().catch(() => {})
    } catch (err) {
      setNotice(`Kicked off — ${err.message}. If it was slow, check back in a moment.`)
    } finally {
      setRunningKey(null)
    }
  }
  const enabledOf = (key) => {
    const row = settings.find((s) => s.key === key)
    return !row || row.enabled !== false
  }
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
    let alive = true
    load().catch((err) => alive && setError(err.message))
    dataStore
      .listAgentSettings()
      .then((s) => alive && setSettings(s))
      .catch(() => {})
    timerRef.current = setInterval(() => load().catch(() => {}), REFRESH_MS)
    return () => {
      alive = false
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [load])

  const feeds = useMemo(() => {
    if (!data) return {}
    return Object.fromEntries(AGENTS.map((a) => [a.key, feedFor(a, data)]))
  }, [data])

  if (error) return <div className="error">Couldn't load bots: {error}</div>
  if (!data) return <div className="loading">Booting the bots…</div>

  const selected = AGENTS.find((a) => a.key === selectedKey) || AGENTS[0]
  const selFeed = feeds[selected.key]
  const selHealth = data.health[selected.key] || []
  const liveCount = AGENTS.filter((a) => enabledOf(a.settingsKey) && lightFor(false, feeds[a.key]) === 'live').length
  const pausedCount = AGENTS.filter((a) => !enabledOf(a.settingsKey)).length

  return (
    <section className="deck-card deck-bots">
      <div className="deck-card-head">
        <div>
          <h2 className="deck-card-title">Bots</h2>
          <p className="deck-card-sub">
            <b className="deck-live">{liveCount}</b> live · <b>{pausedCount}</b> paused · running while you’re away.
          </p>
        </div>
        <div className="deck-bots-right">
          {updatedAt && <span className="deck-dim">updated {formatRelativeTime(new Date(updatedAt).toISOString())}</span>}
          <button type="button" className="deck-btn" onClick={refresh} disabled={refreshing}>
            {refreshing ? '…' : '↻'}
          </button>
        </div>
      </div>

      <div className="deck-stage">
        <div className="deck-stage-grid" aria-hidden="true" />
        <div className="deck-bays">
          {AGENTS.map((a) => {
            const paused = !enabledOf(a.settingsKey)
            const light = lightFor(paused, feeds[a.key])
            return (
              <button
                key={a.key}
                type="button"
                className={`deck-bay${a.key === selectedKey ? ' selected' : ''}${paused ? ' paused' : ''}`}
                style={{ '--agent': a.color }}
                onClick={() => setSelectedKey(a.key)}
              >
                <span className={`deck-bay-tag deck-bay-tag-${light}`}>
                  <span className={`deck-led deck-led-${light}`} aria-hidden="true" />
                  {a.name}
                </span>
                <Robot color={a.color} light={light} />
                <span className="deck-bay-role">{a.role}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="hq-panel" style={{ '--agent': selected.color }}>
        <div className="hq-panel-head">
          <Robot color={selected.color} light={lightFor(!enabledOf(selected.settingsKey), selFeed)} />
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
    </section>
  )
}

// ============================================================ PAGE
export default function AgentHqPage() {
  const { user } = useAuth()
  if (!user.isAdmin) return <Navigate to="/odds" replace />
  return (
    <div className="deck">
      <div className="topbar">
        <Link to="/account" className="back">
          &larr; Account
        </Link>
        <h1>BetMates Ops</h1>
      </div>
      <p className="deck-tagline">Your command deck — post, scan the sports, and check in on the bots.</p>
      <div className="deck-grid">
        <PostStudio />
        <SportsPanel />
        <BotDeck />
      </div>
    </div>
  )
}
