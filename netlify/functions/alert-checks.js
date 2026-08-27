// Scheduled function (see config.schedule) - merges what used to be three
// separate */15 * * * * functions (kickoff-reminders.js, check-odds-
// alerts.js, check-followed-results.js) into one. Each fired independently
// on the same cadence, so three cron invocations happened every 15 minutes
// no matter how little there was to check - this is the same three checks,
// same frequency, same behavior, just one invocation instead of three
// against Netlify's usage credits. Nobody's signed in when a cron job
// fires, so this runs on the service-role key rather than working within
// RLS - the one place in this project that does. A fourth check
// (runLimitBuddyAlerts), a fifth (runValueEdgeAlerts, CoachGPT's
// proactive value-alert push), a sixth (runTrialReminders, BetMates
// Plus's trial-ending push), and a seventh (runGroupRenewalReminders, the
// subscriber-side counterpart for paid groups) joined the same invocation
// later for the same reason - one more independent check, same cost as
// zero extra crons.
// @ts-check
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { apiKeysForSport, GENERIC_SPORTS } from '../../src/lib/sportsConfig.js'
import { periodStart, sumStakesSince } from '../../src/utils/spendLimit.js'
import { findBoardValue } from '../../src/utils/valueFinder.js'

// No Database generic (see dataStore.js's own comment on this) - typing this
// as the real ReturnType<typeof createClient> makes .update()'s argument
// resolve to `never` on a dynamic (non-literal) table name, so this stays
// `any` and the row shapes below carry the actual type information instead.
/** @typedef {any} Supabase */
/** @typedef {{notification_prefs?: Record<string, boolean>}|null} ProfileJoin */
/**
 * @typedef {object} DueBetRow
 * @property {string} id
 * @property {string} user_id
 * @property {any[]} selections
 * @property {ProfileJoin} profiles
 */
/**
 * @typedef {object} DueFollowRow
 * @property {string} id
 * @property {string} user_id
 * @property {string} event_label
 * @property {string} kickoff
 * @property {ProfileJoin} profiles
 */
/**
 * @typedef {object} OddsAlertRow
 * @property {string} id
 * @property {string} user_id
 * @property {string} sport
 * @property {string} event_id
 * @property {string} market_key
 * @property {string} outcome_name
 * @property {string} selection_label
 * @property {string} market_label
 * @property {string} event_label
 * @property {number|string} target_decimal
 * @property {string} kickoff
 * @property {string|null} triggered_at
 */
/**
 * @typedef {object} FollowedFixtureRow
 * @property {string} id
 * @property {string} user_id
 * @property {string} sport
 * @property {string} event_label
 * @property {string} kickoff
 * @property {string|null} result_sent_at
 */
/**
 * @typedef {object} LimitedProfileRow
 * @property {string} id
 * @property {string} display_name
 * @property {number|string} stake_limit_amount
 * @property {'weekly'|'monthly'} stake_limit_period
 * @property {string} limit_buddy_id
 * @property {string|null} limit_alert_sent_at
 */
/**
 * @typedef {object} TrialProfileRow
 * @property {string} id
 * @property {string} premium_until
 * @property {string|null} trial_reminder_sent_at
 */
/**
 * @typedef {object} GroupRenewalRow
 * @property {string} subscriber_id
 * @property {string} current_period_end
 * @property {string|null} renewal_reminder_for_period_end
 * @property {{id: string, name: string, price_amount: number|string}|null} groups
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const VAPID_PUBLIC_KEY = process.env.VITE_VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
const SITE_URL = process.env.URL || 'https://betmates.org'

/**
 * @template {{user_id: string}} T
 * @param {Supabase} supabase
 * @param {T[]} notifications
 * @param {(item: T) => {title: string, body: string, url: string}} buildPayload
 * @returns {Promise<number>}
 */
async function sendAll(supabase, notifications, buildPayload) {
  if (!notifications.length) return 0
  const userIds = [...new Set(notifications.map((n) => n.user_id))]
  const { data: subs } = await supabase.from('push_subscriptions').select('*').in('user_id', userIds)
  /** @type {Map<string, any[]>} */
  const subsByUser = new Map()
  for (const sub of subs ?? []) {
    if (!subsByUser.has(sub.user_id)) subsByUser.set(sub.user_id, [])
    subsByUser.get(sub.user_id)?.push(sub)
  }
  const sends = notifications.flatMap((n) => {
    const userSubs = subsByUser.get(n.user_id) ?? []
    const payload = JSON.stringify(buildPayload(n))
    return userSubs.map((sub) =>
      webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } }, payload).catch(() => null)
    )
  })
  const results = await Promise.allSettled(sends)
  return results.filter((r) => r.status === 'fulfilled').length
}

// --- Kickoff reminders (was kickoff-reminders.js) ---------------------
// Reminds once a bet's earliest leg is within 30 minutes of kickoff. Runs
// every 15 minutes, so nothing sits unreminded for more than ~15 minutes
// inside that window, and kickoff_reminder_sent_at stops a second run from
// double-sending before it passes out of range.
const REMINDER_WINDOW_MS = 30 * 60 * 1000

/** @param {any[]} selections */
function earliestKickoff(selections) {
  const times = (selections ?? [])
    .map((s) => s.kickoff)
    .filter(Boolean)
    .map((t) => new Date(t).getTime())
    .filter((t) => Number.isFinite(t))
  return times.length ? Math.min(...times) : null
}

/** @param {any[]} selections */
function eventSummary(selections) {
  return selections?.[0]?.event ?? 'Your bet'
}

/**
 * @param {Supabase} supabase
 * @param {'bet_posts'|'manual_entries'} table
 * @returns {Promise<(DueBetRow & {kickoffAt: number})[]>}
 */
async function collectDueBets(supabase, table) {
  const { data, error } = await supabase
    .from(table)
    .select('id,user_id,selections,profiles(notification_prefs)')
    .eq('status', 'open')
    .is('kickoff_reminder_sent_at', null)
  if (error || !data) return []

  const rows = /** @type {DueBetRow[]} */ (/** @type {unknown} */ (data))
  const now = Date.now()
  return rows
    .map((row) => ({ ...row, kickoffAt: earliestKickoff(row.selections) }))
    .filter(/** @returns {row is DueBetRow & {kickoffAt: number}} */ (row) => row.kickoffAt !== null && row.kickoffAt > now && row.kickoffAt <= now + REMINDER_WINDOW_MS)
}

// Same idea as collectDueBets above, but for a followed fixture (see
// FollowButton.jsx / dataStore.js's followFixture) rather than an open bet
// - kickoff lives on its own column here instead of nested in a
// selections array, so this reads it directly rather than reusing
// earliestKickoff.
/**
 * @param {Supabase} supabase
 * @returns {Promise<(DueFollowRow & {kickoffAt: number})[]>}
 */
async function collectDueFollows(supabase) {
  const { data, error } = await supabase
    .from('followed_fixtures')
    .select('id,user_id,event_label,kickoff,profiles(notification_prefs)')
    .is('kickoff_reminder_sent_at', null)
  if (error || !data) return []

  const rows = /** @type {DueFollowRow[]} */ (/** @type {unknown} */ (data))
  const now = Date.now()
  return rows
    .map((row) => ({ ...row, kickoffAt: new Date(row.kickoff).getTime() }))
    .filter((row) => row.kickoffAt > now && row.kickoffAt <= now + REMINDER_WINDOW_MS)
}

/** @param {Supabase} supabase */
async function runKickoffReminders(supabase) {
  const [duePosts, dueManual, dueFollows] = await Promise.all([
    collectDueBets(supabase, 'bet_posts'),
    collectDueBets(supabase, 'manual_entries'),
    collectDueFollows(supabase)
  ])
  const due = [
    ...duePosts.map((r) => ({ ...r, table: /** @type {const} */ ('bet_posts') })),
    ...dueManual.map((r) => ({ ...r, table: /** @type {const} */ ('manual_entries') })),
    ...dueFollows.map((r) => ({ ...r, table: /** @type {const} */ ('followed_fixtures') }))
  ]
  if (!due.length) return { sent: 0 }

  // Mark every due row up front so a slow push send can't cause the next
  // 15-minute run to pick the same bet back up.
  await Promise.all(
    due.map((row) => supabase.from(row.table).update({ kickoff_reminder_sent_at: new Date().toISOString() }).eq('id', row.id))
  )

  const optedIn = due.filter((row) => row.profiles?.notification_prefs?.kickoffReminders === true)
  const sent = await sendAll(supabase, optedIn, (row) => {
    const minutes = Math.max(1, Math.round((row.kickoffAt - Date.now()) / 60000))
    const isFollow = row.table === 'followed_fixtures'
    return {
      title: '⏰ Kickoff soon',
      body: `${isFollow ? row.event_label : eventSummary(/** @type {any} */ (row).selections)} kicks off in ${minutes} min`,
      url: isFollow ? '/#/odds' : '/#/tracker'
    }
  })
  return { sent, marked: due.length }
}

// --- Odds alerts (was check-odds-alerts.js) ----------------------------
// Re-fetches each alert's fixture through the SAME internal /api/* routes
// the client itself uses (odds.js/ufc.js/sport.js already resolve
// everything down to a best-price-per-outcome shape), so there's no
// separate provider-parsing logic to keep in sync here - just look up the
// one outcome and compare its price to the target. Racing has no alerts to
// check: the create UI never offers a bell for it (racingClient.js's
// USE_MOCK is true, its prices never move).
/**
 * @param {string} sport
 * @param {string} eventId
 */
function eventPath(sport, eventId) {
  if (sport === 'football') return `/api/odds?id=${encodeURIComponent(eventId)}`
  if (sport === 'ufc') return `/api/ufc?id=${encodeURIComponent(eventId)}`
  return `/api/sport?sport=${encodeURIComponent(sport)}&id=${encodeURIComponent(eventId)}`
}

/**
 * @param {string} sport
 * @param {string} eventId
 * @param {string} marketKey
 * @param {string} outcomeName
 * @returns {Promise<number|null>}
 */
async function fetchCurrentPrice(sport, eventId, marketKey, outcomeName) {
  const res = await fetch(`${SITE_URL}${eventPath(sport, eventId)}`)
  if (!res.ok) return null
  const event = await res.json()
  const market = event.markets?.find((m) => m.key === marketKey)
  const outcome = market?.outcomes?.find((o) => o.name === outcomeName)
  return outcome?.bestOdds?.decimal ?? null
}

/** @param {Supabase} supabase */
async function runOddsAlerts(supabase) {
  const { data } = await supabase.from('odds_alerts').select('*').is('triggered_at', null)
  const pending = /** @type {OddsAlertRow[]} */ (/** @type {unknown} */ (data ?? []))
  if (!pending.length) return { checked: 0 }

  // An alert whose event has already kicked off has nothing left to check
  // - pre-match prices are moot once the market's gone in-play - so these
  // are just cleaned up rather than re-fetched every 15 minutes forever.
  const now = Date.now()
  const expired = pending.filter((a) => new Date(a.kickoff).getTime() <= now)
  const active = pending.filter((a) => new Date(a.kickoff).getTime() > now)
  if (expired.length) await supabase.from('odds_alerts').delete().in('id', expired.map((a) => a.id))
  if (!active.length) return { checked: 0, expired: expired.length }

  /** @type {Map<string, OddsAlertRow[]>} */
  const groups = new Map()
  for (const alert of active) {
    const key = `${alert.sport}|${alert.event_id}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)?.push(alert)
  }

  /** @type {(OddsAlertRow & {currentDecimal: number})[]} */
  const triggered = []
  await Promise.all(
    [...groups.entries()].map(async ([key, alerts]) => {
      const [sport, eventId] = key.split('|')
      await Promise.all(
        alerts.map(async (alert) => {
          const current = await fetchCurrentPrice(sport, eventId, alert.market_key, alert.outcome_name)
          if (current !== null && current >= Number(alert.target_decimal)) triggered.push({ ...alert, currentDecimal: current })
        })
      )
    })
  )
  if (!triggered.length) return { checked: active.length, triggered: 0 }

  await Promise.all(triggered.map((a) => supabase.from('odds_alerts').update({ triggered_at: new Date().toISOString() }).eq('id', a.id)))

  const sent = await sendAll(supabase, triggered, (a) => ({
    title: '🎯 Odds alert',
    body: `${a.selection_label} (${a.market_label}) on ${a.event_label} is now ${a.currentDecimal.toFixed(2)} - your target was ${Number(a.target_decimal).toFixed(2)}`,
    url: '/#/alerts'
  }))
  return { checked: active.length, triggered: triggered.length, sent }
}

// --- Followed-fixture results (was check-followed-results.js) ----------
// The "result" half of a followed fixture. Kickoff reminders above handle
// the other end; this checks once a followed fixture's estimated live
// window has finished, via the same /api/scores endpoint
// src/lib/settlement.js already uses for bet auto-settlement.
const DURATION_MINUTES = {
  football: 130,
  mls: 130,
  ufc: 240,
  boxing: 240,
  tennis: 200,
  basketball: 150,
  hockey: 150,
  baseball: 210,
  nfl: 210,
  rugbyLeague: 120,
  rugbyUnion: 120,
  cricket: 360
}

/**
 * @param {string[]} apiSportKeys
 * @returns {Promise<any[]>}
 */
async function fetchScores(apiSportKeys) {
  if (!apiSportKeys.length) return []
  const res = await fetch(`${SITE_URL}/api/scores?keys=${encodeURIComponent(apiSportKeys.join(','))}`)
  if (!res.ok) return []
  return res.json()
}

/** @param {Supabase} supabase */
async function runFollowedResults(supabase) {
  const { data } = await supabase.from('followed_fixtures').select('*').is('result_sent_at', null)
  const pending = /** @type {FollowedFixtureRow[]} */ (/** @type {unknown} */ (data ?? []))
  if (!pending.length) return { checked: 0 }

  const now = Date.now()
  // Only worth checking once the event's estimated live window has
  // finished - checking earlier would just come back empty every time.
  const ready = pending.filter((f) => {
    const duration = (DURATION_MINUTES[f.sport] ?? 150) * 60000
    return now >= new Date(f.kickoff).getTime() + duration
  })
  if (!ready.length) return { checked: 0 }

  /** @type {Map<string, FollowedFixtureRow[]>} */
  const bySport = new Map()
  for (const f of ready) {
    if (!bySport.has(f.sport)) bySport.set(f.sport, [])
    bySport.get(f.sport)?.push(f)
  }

  /** @type {(FollowedFixtureRow & {scoreLine: string})[]} */
  const notifications = []
  for (const [sport, follows] of bySport) {
    const games = await fetchScores(apiKeysForSport(sport))
    for (const follow of follows) {
      const game = games.find((g) => follow.event_label === `${g.homeTeam} v ${g.awayTeam}`)
      if (!game) continue
      const home = game.scores.find((s) => s.name === game.homeTeam)?.score
      const away = game.scores.find((s) => s.name === game.awayTeam)?.score
      notifications.push({ ...follow, scoreLine: `${game.homeTeam} ${home}-${away} ${game.awayTeam}` })
    }
  }

  // Every follow whose window has passed gets marked seen either way - a
  // sport with no score mapping (racing, tennis - see apiKeysForSport) or
  // a game not in this response yet stops being retried forever instead
  // of getting re-checked on every run indefinitely.
  await supabase
    .from('followed_fixtures')
    .update({ result_sent_at: new Date().toISOString() })
    .in('id', ready.map((f) => f.id))

  const sent = await sendAll(supabase, notifications, (n) => ({ title: '🏁 Full time', body: n.scoreLine, url: '/#/odds' }))
  return { checked: ready.length, notified: notifications.length, sent }
}

// --- Spend-limit buddy alerts -------------------------------------------
// The push half of AccountPage.jsx's "Notify a mate" picker: once someone
// with a limit_buddy_id set has actually reached their spend limit for the
// current period, their buddy gets told. limit_alert_sent_at is a per-
// period watermark rather than a boolean - comparing it against
// periodStart(period) means it "resets" the moment a new week/month
// starts, with no separate job needed to clear it.
/** @param {Supabase} supabase */
async function runLimitBuddyAlerts(supabase) {
  const { data } = await supabase
    .from('profiles')
    .select('id,display_name,stake_limit_amount,stake_limit_period,limit_buddy_id,limit_alert_sent_at')
    .not('stake_limit_amount', 'is', null)
    .not('limit_buddy_id', 'is', null)
  const limited = /** @type {LimitedProfileRow[]} */ (/** @type {unknown} */ (data ?? []))
  if (!limited.length) return { checked: 0 }

  /** @type {(LimitedProfileRow & {spend: number})[]} */
  const due = []
  for (const profile of limited) {
    const since = periodStart(profile.stake_limit_period)
    if (profile.limit_alert_sent_at && new Date(profile.limit_alert_sent_at) >= since) continue

    const [{ data: posts }, { data: manual }] = await Promise.all([
      supabase.from('bet_posts').select('stake,created_at').eq('user_id', profile.id),
      supabase.from('manual_entries').select('stake,created_at').eq('user_id', profile.id)
    ])
    const entries = [...(posts ?? []), ...(manual ?? [])].map((e) => ({ stake: e.stake, createdAt: e.created_at }))
    const spend = sumStakesSince(entries, since)
    if (spend >= Number(profile.stake_limit_amount)) due.push({ ...profile, spend })
  }
  if (!due.length) return { checked: limited.length, due: 0 }

  await Promise.all(due.map((p) => supabase.from('profiles').update({ limit_alert_sent_at: new Date().toISOString() }).eq('id', p.id)))

  const sent = await sendAll(
    supabase,
    due.map((p) => ({ ...p, user_id: p.limit_buddy_id })),
    (p) => ({
      title: '👋 Spend-limit check-in',
      body: `${p.display_name} has hit their ${p.stake_limit_period === 'monthly' ? 'monthly' : 'weekly'} spend limit of £${Number(p.stake_limit_amount).toFixed(2)} - might be worth a quick check-in.`,
      url: '/#/account'
    })
  )
  return { checked: limited.length, due: due.length, sent }
}

// --- BetMates Plus trial-ending reminder --------------------------------
// A day's warning before a free trial's card auto-charges (see the trial
// commit's own note: card is collected at checkout, so it converts
// automatically rather than needing a second action). premium_status is
// checked rather than is_premium, since is_premium alone can't distinguish
// a trial from an ordinary paid renewal - only trialing subscribers should
// see "your trial ends" copy. Treated as transactional (no notification_prefs
// gate), same as the app never gating "bet settled" behind an opt-in - it's
// telling someone about their own upcoming charge, not a marketing nudge.
const TRIAL_REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000

/** @param {Supabase} supabase */
async function runTrialReminders(supabase) {
  const { data } = await supabase
    .from('profiles')
    .select('id,premium_until,trial_reminder_sent_at')
    .eq('premium_status', 'trialing')
    .not('premium_until', 'is', null)
    .is('trial_reminder_sent_at', null)
  const trialing = /** @type {TrialProfileRow[]} */ (/** @type {unknown} */ (data ?? []))
  if (!trialing.length) return { checked: 0 }

  const now = Date.now()
  const due = trialing.filter((p) => {
    const endsAt = new Date(p.premium_until).getTime()
    return endsAt > now && endsAt <= now + TRIAL_REMINDER_WINDOW_MS
  })
  if (!due.length) return { checked: trialing.length, due: 0 }

  // Marked up front, same reasoning as every other watermark in this file -
  // a slow send can't cause the next 15-minute run to double-fire.
  await Promise.all(
    due.map((p) => supabase.from('profiles').update({ trial_reminder_sent_at: new Date().toISOString() }).eq('id', p.id))
  )

  const sent = await sendAll(supabase, due.map((p) => ({ ...p, user_id: p.id })), () => ({
    title: '⏳ Your free trial ends tomorrow',
    body: "BetMates Plus renews automatically at the end of your trial - manage or cancel any time from Account.",
    url: '/#/account'
  }))
  return { checked: trialing.length, due: due.length, sent }
}

// --- Paid group renewal reminder ----------------------------------------
// The subscriber-side counterpart to the trial reminder above - a day's
// warning before a paid group membership renews and charges again. Unlike
// the trial reminder, this has no premium_status-style distinction to make
// (group subscriptions are never given a trial - see
// create-group-checkout-session.js), so every active/trialing row with an
// approaching current_period_end qualifies. Also transactional, same
// no-notification_prefs-gate reasoning as the trial reminder.
const GROUP_RENEWAL_REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000

/** @param {Supabase} supabase */
async function runGroupRenewalReminders(supabase) {
  const { data } = await supabase
    .from('group_subscriptions')
    .select('subscriber_id,current_period_end,renewal_reminder_for_period_end,groups(id,name,price_amount)')
    .in('status', ['active', 'trialing'])
    .not('current_period_end', 'is', null)
  const rows = /** @type {GroupRenewalRow[]} */ (/** @type {unknown} */ (data ?? []))
  if (!rows.length) return { checked: 0 }

  const now = Date.now()
  // renewal_reminder_for_period_end has to be compared against the row's own
  // current_period_end in JS (PostgREST can't do a column-vs-column filter)
  // - see schema.sql's comment on why this is what makes the reminder
  // resurface every renewal instead of firing only once ever.
  const due = rows.filter((row) => {
    if (!row.groups) return false
    const endsAt = new Date(row.current_period_end).getTime()
    if (endsAt <= now || endsAt > now + GROUP_RENEWAL_REMINDER_WINDOW_MS) return false
    return row.renewal_reminder_for_period_end !== row.current_period_end
  })
  if (!due.length) return { checked: rows.length, due: 0 }

  await Promise.all(
    due.map((row) =>
      supabase
        .from('group_subscriptions')
        .update({ renewal_reminder_for_period_end: row.current_period_end })
        .eq('subscriber_id', row.subscriber_id)
        .eq('group_id', row.groups.id)
    )
  )

  const sent = await sendAll(supabase, due.map((row) => ({ ...row, user_id: row.subscriber_id })), (row) => ({
    title: `⏳ ${row.groups.name} renews soon`,
    body: `Renews in ~24h at £${Number(row.groups.price_amount).toFixed(2)}/month - manage or cancel any time from the group's Members tab.`,
    url: `/#/groups/${row.groups.id}`
  }))
  return { checked: rows.length, due: due.length, sent }
}

// --- Value-edge alerts (CoachGPT round 2) -------------------------------
// Proactive half of CoachGPT: pushes when a followed team/fighter has a
// real price edge on the board, rather than only answering when asked in
// chat. findBoardValue is the exact same "meaningful edge" bar the Odds
// tab's own value flag already uses (via computeBestValue), scanned
// against each represented sport's bulk list ONCE per run - not once per
// followed participant - so this piggybacks on apiCache.js's existing
// LIST_TTL cache the same way odds-snapshot.js already does rather than
// spending extra Odds-API provider quota.
const VALUE_EDGE_SPORTS = ['football', 'ufc', ...Object.keys(GENERIC_SPORTS)]

/** @param {string} sport */
function sportListPath(sport) {
  if (sport === 'football') return '/api/odds'
  if (sport === 'ufc') return '/api/ufc'
  return `/api/sport?sport=${encodeURIComponent(sport)}`
}

/**
 * @param {string} sport
 * @returns {Promise<any[]>}
 */
async function fetchSportList(sport) {
  const res = await fetch(`${SITE_URL}${sportListPath(sport)}`)
  if (!res.ok) return []
  return res.json()
}

/** @param {Supabase} supabase */
async function runValueEdgeAlerts(supabase) {
  const { data: optedIn } = await supabase.from('profiles').select('id').eq('notification_prefs->>valueEdgeAlerts', 'true')
  if (!optedIn?.length) return { checked: 0 }

  const userIds = optedIn.map((p) => p.id)
  const { data: follows } = await supabase.from('followed_participants').select('user_id,sport,participant_name').in('user_id', userIds)
  if (!follows?.length) return { checked: 0 }

  /** @type {Map<string, {userId: string, name: string}[]>} */
  const followersBySport = new Map()
  for (const row of follows) {
    if (!VALUE_EDGE_SPORTS.includes(row.sport)) continue
    if (!followersBySport.has(row.sport)) followersBySport.set(row.sport, [])
    followersBySport.get(row.sport)?.push({ userId: row.user_id, name: row.participant_name })
  }
  if (!followersBySport.size) return { checked: userIds.length, found: 0 }

  // Keyed by user+fixture so the same edge matching two of a user's
  // followed names (e.g. following both sides of the same fixture) can't
  // produce two rows and collide with value_edge_alerts_sent's unique
  // constraint - edges within a sport are already richest-first, so the
  // first candidate found for a key is the best one.
  /** @type {Map<string, {user_id: string, fixture_id: string, sport: string, matchup: string, selection: string, best: number, bookmaker: string|null, pct: number}>} */
  const candidateMap = new Map()
  for (const [sport, followers] of followersBySport) {
    const items = await fetchSportList(sport)
    const edges = findBoardValue(items, sport, { limit: 50 })
    for (const edge of edges) {
      const haystack = edge.matchup.toLowerCase()
      for (const follower of followers) {
        if (!haystack.includes(follower.name.toLowerCase())) continue
        const key = `${follower.userId}|${edge.id}`
        if (candidateMap.has(key)) continue
        candidateMap.set(key, {
          user_id: follower.userId,
          fixture_id: String(edge.id),
          sport,
          matchup: edge.matchup,
          selection: edge.selection,
          best: edge.best,
          bookmaker: edge.bookmaker,
          pct: edge.pct
        })
      }
    }
  }
  const candidates = [...candidateMap.values()]
  if (!candidates.length) return { checked: userIds.length, found: 0 }

  const { data: alreadySent } = await supabase
    .from('value_edge_alerts_sent')
    .select('user_id,fixture_id')
    .in('user_id', [...new Set(candidates.map((c) => c.user_id))])
  const sentKeys = new Set((alreadySent ?? []).map((r) => `${r.user_id}|${r.fixture_id}`))
  const fresh = candidates.filter((c) => !sentKeys.has(`${c.user_id}|${c.fixture_id}`))
  if (!fresh.length) return { checked: userIds.length, found: candidates.length, sent: 0 }

  await supabase.from('value_edge_alerts_sent').insert(fresh.map((c) => ({ user_id: c.user_id, fixture_id: c.fixture_id, sport: c.sport })))

  const sent = await sendAll(supabase, fresh, (c) => ({
    title: '🧠 CoachGPT spotted value',
    body: `${c.selection} in ${c.matchup} at ${c.best.toFixed(2)}${c.bookmaker ? ` (${c.bookmaker})` : ''} - ${c.pct.toFixed(0)}% above the market.`,
    url: '/#/odds'
  }))
  return { checked: userIds.length, found: candidates.length, sent }
}

/**
 * @param {Request} req
 * @returns {Promise<Response>}
 */
export default async (req) => {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ reason: 'not configured' }), { status: 200 })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) webpush.setVapidDetails('mailto:betmates@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

  // Independent of each other (different tables, different push copy), so
  // they run concurrently rather than one after another - and one throwing
  // doesn't stop the others from still doing their job.
  const [kickoffReminders, oddsAlerts, followedResults, limitBuddyAlerts, trialReminders, groupRenewalReminders, valueEdgeAlerts] =
    await Promise.allSettled([
      runKickoffReminders(supabase),
      runOddsAlerts(supabase),
      runFollowedResults(supabase),
      runLimitBuddyAlerts(supabase),
      runTrialReminders(supabase),
      runGroupRenewalReminders(supabase),
      runValueEdgeAlerts(supabase)
    ])

  /** @param {PromiseSettledResult<any>} r */
  const settle = (r) => (r.status === 'fulfilled' ? r.value : { error: r.reason?.message ?? String(r.reason) })
  return new Response(
    JSON.stringify({
      kickoffReminders: settle(kickoffReminders),
      oddsAlerts: settle(oddsAlerts),
      followedResults: settle(followedResults),
      limitBuddyAlerts: settle(limitBuddyAlerts),
      trialReminders: settle(trialReminders),
      groupRenewalReminders: settle(groupRenewalReminders),
      valueEdgeAlerts: settle(valueEdgeAlerts)
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  )
}

export const config = {
  // Dropped from */15 to */30 (matching every other scheduled function in
  // this project) to cut credit usage while there's no real traffic yet to
  // notice the extra lag on pre-kickoff/odds/results alerts - bump back to
  // */15 once real usage data says the faster cadence actually matters.
  schedule: '*/30 * * * *'
}
