// Agent HQ live-feed endpoint (src/pages/AgentHqPage.jsx -> dataStore
// .getAgentHqFeed -> /api/agent-hq-feed). The five "watch" agents
// (Dex/Mira/Nova/Priya/Bea) fire server-side against tables the anon key can't
// read, so the control room had no live feed for them. This endpoint is that
// feed: admin-verified (same handshake as admin-analytics.js - anon getUser for
// identity, then a service-role profiles.is_admin check), it reads each agent's
// OWN domain table with the service-role key and returns, per agent, what it's
// DOING (recent real events), what it's WATCHING (the live inputs it acts on),
// and a lastActivity stamp. It also returns a `health` map for all eight agents
// -> which integrations each depends on and whether that env var is set (NAMES
// and a boolean only, never a secret value).
//
// There is no per-agent run-history table in the schema, so "recent activity"
// is derived from each agent's domain rows (settled bets, triggered odds_alerts,
// limit_alert_sent_at, odds_snapshots, group milestones), exactly the same rows
// the scheduled functions act on. Read-only: this endpoint never writes.
//
// Contract kept with the rest of the app: without Supabase configured it
// returns an empty payload (200) rather than throwing, and every per-agent
// gather is wrapped so one unreadable table degrades that agent's tile instead
// of failing the whole room.
import { createClient } from '@supabase/supabase-js'
import { biggestSharpMove } from '../../src/lib/marketSteam.js'
import { MEMBER_MILESTONES } from '../../src/lib/communityMilestone.js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const BET_TABLES = ['bet_posts', 'manual_entries']
const SETTLED = ['won', 'lost', 'void']
const EMPTY_FEED = { doing: [], watching: [], lastActivity: null }

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

// Health: which integrations each agent leans on, and whether that env var is
// present. Boolean(process.env.NAME) only - the value never leaves the server.
// Mirrors the "missing keys degrade, don't crash" guard each function ships.
function has(...names) {
  return names.some((n) => Boolean(process.env[n]))
}
function buildHealth() {
  const discord = has('DISCORD_WEBHOOK_URL')
  const bot = has('DISCORD_BOT_TOKEN') && has('DISCORD_CHANNEL_ID')
  const anthropic = has('COACH_ANTHROPIC_KEY', 'OMNIROUTE_API_KEY')
  const odds = has('ODDS_API_KEY')
  const github = has('SAGE_GITHUB_TOKEN') && has('SAGE_GITHUB_REPO')
  return {
    coco: [{ name: 'Discord bot', ok: bot }],
    sage: [
      { name: 'Discord bot', ok: bot },
      { name: 'Anthropic key', ok: anthropic },
      { name: 'GitHub issues', ok: github }
    ],
    coach: [
      { name: 'Anthropic key', ok: anthropic },
      { name: 'Discord webhook', ok: discord }
    ],
    dex: [
      { name: 'Discord webhook', ok: discord },
      { name: 'Odds API', ok: odds }
    ],
    mira: [
      { name: 'Discord webhook', ok: discord },
      { name: 'Odds API', ok: odds }
    ],
    nova: [
      { name: 'Discord webhook', ok: discord },
      { name: 'Odds API', ok: odds }
    ],
    priya: [{ name: 'Discord webhook', ok: discord }],
    bea: [{ name: 'Discord webhook', ok: discord }]
  }
}

// Newest ISO timestamp among a list (nulls skipped), or null.
function newest(times) {
  const t = times.filter(Boolean).sort()
  return t.length ? t[t.length - 1] : null
}

// --- Dex: settlements + open-bet backlog --------------------------------
async function dexFeed(admin) {
  const settledRes = await Promise.all(
    BET_TABLES.map((table) =>
      admin
        .from(table)
        .select('id,sport,status,potential_return,settled_at')
        .in('status', SETTLED)
        .order('settled_at', { ascending: false })
        .limit(10)
        .then(({ data }) => (data || []).map((r) => ({ ...r, table })))
    )
  )
  const settled = settledRes
    .flat()
    .sort((a, b) => String(b.settled_at || '').localeCompare(String(a.settled_at || '')))
    .slice(0, 8)
  const openCounts = await Promise.all(
    BET_TABLES.map((table) => admin.from(table).select('id', { count: 'exact', head: true }).eq('status', 'open').then(({ count }) => count || 0))
  )
  const open = openCounts.reduce((a, b) => a + b, 0)
  const doing = settled.map((r) => ({
    when: r.settled_at,
    text: `Settled a ${r.sport || 'bet'} slip — ${r.status}`,
    tone: r.status === 'won' ? 'ok' : r.status === 'lost' ? 'bad' : 'info'
  }))
  return { doing, watching: [{ label: 'Open bets awaiting settlement', value: open }], lastActivity: newest(settled.map((r) => r.settled_at)) }
}

// --- Mira: odds-alert hits + armed alerts -------------------------------
async function miraFeed(admin) {
  const nowIso = new Date().toISOString()
  const { data: hits } = await admin
    .from('odds_alerts')
    .select('id,selection_label,outcome_name,event_label,target_decimal,triggered_at')
    .not('triggered_at', 'is', null)
    .order('triggered_at', { ascending: false })
    .limit(8)
  const { count: armed } = await admin
    .from('odds_alerts')
    .select('id', { count: 'exact', head: true })
    .is('triggered_at', null)
    .gt('kickoff', nowIso)
  const rows = hits || []
  const doing = rows.map((r) => ({
    when: r.triggered_at,
    text: `Alert hit — ${r.selection_label || r.outcome_name || 'a price'} reached ${r.target_decimal}`,
    tone: 'ok'
  }))
  return { doing, watching: [{ label: 'Armed alerts (kickoff ahead)', value: armed || 0 }], lastActivity: newest(rows.map((r) => r.triggered_at)) }
}

// --- Priya: spend-limit compliance --------------------------------------
// Sensitive by nature: counts and periods only - no member names or amounts.
async function priyaFeed(admin) {
  const { data: limited } = await admin
    .from('profiles')
    .select('stake_limit_period,limit_alert_sent_at')
    .not('stake_limit_amount', 'is', null)
    .not('limit_buddy_id', 'is', null)
  const rows = limited || []
  const alerted = rows.filter((r) => r.limit_alert_sent_at)
  const doing = alerted
    .sort((a, b) => String(b.limit_alert_sent_at).localeCompare(String(a.limit_alert_sent_at)))
    .slice(0, 8)
    .map((r) => ({ when: r.limit_alert_sent_at, text: `Spend-limit alert sent (${r.stake_limit_period || 'period'})`, tone: 'bad' }))
  return {
    doing,
    watching: [
      { label: 'Members with a spend limit', value: rows.length },
      { label: 'Alerted this period', value: alerted.length }
    ],
    lastActivity: newest(rows.map((r) => r.limit_alert_sent_at))
  }
}

// --- Nova: sharp-money moves --------------------------------------------
async function novaFeed(admin) {
  const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
  const { data: rows } = await admin
    .from('odds_snapshots')
    .select('fixture_id,market,selection,bookmaker,odds,fetched_at')
    .gte('fetched_at', since)
    .order('fetched_at', { ascending: false })
    .limit(3000)
  const snaps = rows || []
  const fixtures = new Set(snaps.map((r) => r.fixture_id))
  const move = biggestSharpMove(snaps)
  const doing = []
  if (move) {
    let label = move.selection
    const { data: fx } = await admin.from('fixtures').select('home_team,away_team').eq('id', move.fixtureId).maybeSingle()
    if (fx) label = `${fx.home_team} v ${fx.away_team}: ${move.selection}`
    doing.push({
      when: null,
      text: `${label} — ${move.direction} ${move.pct}% (${move.from} → ${move.to})`,
      tone: move.direction === 'shortening' ? 'ok' : 'info'
    })
  }
  return {
    doing,
    watching: [
      { label: 'Fixtures tracked (48h)', value: fixtures.size },
      { label: 'Price snapshots (48h)', value: snaps.length }
    ],
    lastActivity: newest(snaps.slice(0, 1).map((r) => r.fetched_at))
  }
}

// --- Bea: community milestones ------------------------------------------
async function beaFeed(admin) {
  const { data: groups } = await admin.from('groups').select('name,member_count,last_member_milestone').order('member_count', { ascending: false })
  const rows = groups || []
  const doing = rows
    .filter((g) => (g.last_member_milestone || 0) > 0)
    .slice(0, 8)
    .map((g) => ({ when: null, text: `${g.name} reached ${g.last_member_milestone} members`, tone: 'ok' }))
  // Watching: groups closest to their next milestone.
  const watching = rows
    .map((g) => {
      const next = MEMBER_MILESTONES.find((m) => m > (g.last_member_milestone || 0))
      if (!next) return null
      return { label: `${g.name} → ${next}`, value: `${g.member_count || 0}/${next}`, _gap: next - (g.member_count || 0) }
    })
    .filter(Boolean)
    .sort((a, b) => a._gap - b._gap)
    .slice(0, 4)
    .map(({ _gap, ...rest }) => rest)
  return { doing, watching, lastActivity: null }
}

const GATHERERS = { dex: dexFeed, mira: miraFeed, nova: novaFeed, priya: priyaFeed, bea: beaFeed }

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  // Not configured: hand back an empty room rather than throwing - the control
  // room stays usable and just shows agents with no live feed.
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) return json({ feeds: {}, health: buildHealth() })

  let payload
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Bad request' }, 400)
  }
  const { accessToken } = payload || {}
  if (!accessToken) return json({ error: 'Missing accessToken' }, 400)

  try {
    const authClient = createClient(SUPABASE_URL, ANON_KEY)
    const { data: userData, error: userError } = await authClient.auth.getUser(accessToken)
    if (userError || !userData?.user) return json({ error: 'Invalid or expired session.' }, 401)

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { data: profile, error: profileError } = await admin.from('profiles').select('is_admin').eq('id', userData.user.id).maybeSingle()
    if (profileError) throw profileError
    if (!profile?.is_admin) return json({ error: 'Forbidden' }, 403)

    // Gather each watch agent's feed independently: a failure on one table
    // degrades that agent's tile to empty rather than sinking the whole room.
    const keys = Object.keys(GATHERERS)
    const settled = await Promise.all(
      keys.map((k) =>
        GATHERERS[k](admin)
          .then((feed) => [k, feed])
          .catch(() => [k, EMPTY_FEED])
      )
    )
    return json({ feeds: Object.fromEntries(settled), health: buildHealth() })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
}
