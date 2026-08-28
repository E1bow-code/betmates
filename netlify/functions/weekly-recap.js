// Scheduled function (see `config.schedule` below), Sunday evenings - turns
// the on-demand "Share recap" button on Tracker (src/lib/shareImage.js)
// into something proactive: whoever's opted in gets a push with their
// week's numbers without having to go looking for them. Same service-role
// pattern as every other scheduled function - nobody's signed in when a
// cron job fires, so it has to bypass RLS rather than work within it.
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { computeStats } from '../../src/utils/trackerStats.js'
import { requestCoachTake } from '../../src/lib/coach.js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const VAPID_PUBLIC_KEY = process.env.VITE_VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
// Optional: when set, the recap push leads with a one-line Coach's take on the
// week instead of the bare numbers. Unset -> the numeric body below, unchanged.
// Named COACH_ANTHROPIC_KEY, not ANTHROPIC_API_KEY - see coachgpt.js's header
// comment for why (Netlify's AI Gateway intercepts the latter in local dev).
// OMNIROUTE_BASE_URL, when set, routes this same call through a self-hosted
// OmniRoute gateway instead - see coach.js's header comment for the full
// contract; unset by default so this keeps hitting Anthropic directly.
const OMNIROUTE_BASE_URL = process.env.OMNIROUTE_BASE_URL
const ANTHROPIC_API_KEY = OMNIROUTE_BASE_URL ? process.env.OMNIROUTE_API_KEY : process.env.COACH_ANTHROPIC_KEY
const COACH_ROUTE = OMNIROUTE_BASE_URL ? { baseUrl: OMNIROUTE_BASE_URL, modelPrefix: process.env.OMNIROUTE_MODEL_PREFIX } : undefined

export default async (req) => {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return new Response(JSON.stringify({ sent: 0, reason: 'not configured' }), { status: 200 })
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    webpush.setVapidDetails('mailto:betmates@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)
    const weekAgoIso = weekAgo.toISOString()

    // Every other scheduled push in this codebase has a watermark
    // specifically so a repeat invocation in the same window can't
    // double-send (team_news_notified_at, streak_reminder_sent_date,
    // kickoff_reminder_sent_at) - this one never did, and unlike its
    // siblings it has no per-item dedup to fall back on either, so
    // simply calling this function's public URL twice fanned out a full
    // duplicate recap to every opted-in user each time.
    //
    // The dedup cutoff must be LOOSER than the exact 7-day bets window,
    // not equal to it. This cron fires exactly weekly, but the watermark
    // is written a few seconds/minutes into the run (after each user's
    // per-user coach take), so a user's stored weekly_recap_sent_at ends
    // up slightly NEWER than next week's `now - 7d` instant. Reusing
    // weekAgoIso as the cutoff therefore failed the `.lt` test and skipped
    // every active recipient on the next run - they got the recap
    // biweekly, not weekly. A 6-day cutoff keeps the once-per-week intent
    // (last week's send is >6d old) while still blocking a same-window
    // double-invoke (its watermark is minutes old, well inside 6 days).
    const sentCutoff = new Date()
    sentCutoff.setDate(sentCutoff.getDate() - 6)
    const sentCutoffIso = sentCutoff.toISOString()
    const { data: optedIn } = await supabase
      .from('profiles')
      .select('id')
      .eq('notification_prefs->>weeklyRecap', 'true')
      .or(`weekly_recap_sent_at.is.null,weekly_recap_sent_at.lt.${sentCutoffIso}`)
    if (!optedIn?.length) return new Response(JSON.stringify({ sent: 0 }), { status: 200 })

    const userIds = optedIn.map((p) => p.id)

    const [{ data: posts }, { data: manual }, { data: subs }] = await Promise.all([
      supabase
        .from('bet_posts')
        .select('user_id,stake,status,potential_return,settled_at')
        .in('user_id', userIds)
        .in('status', ['won', 'lost', 'void'])
        .gte('settled_at', weekAgoIso),
      supabase
        .from('manual_entries')
        .select('user_id,stake,status,potential_return,settled_at')
        .in('user_id', userIds)
        .in('status', ['won', 'lost', 'void'])
        .gte('settled_at', weekAgoIso),
      supabase.from('push_subscriptions').select('*').in('user_id', userIds)
    ])

    const byUser = new Map()
    for (const row of [...(posts ?? []), ...(manual ?? [])]) {
      if (!byUser.has(row.user_id)) byUser.set(row.user_id, [])
      byUser.get(row.user_id).push({ stake: row.stake, status: row.status, potentialReturn: row.potential_return })
    }

    const subsByUser = new Map()
    for (const sub of subs ?? []) {
      if (!subsByUser.has(sub.user_id)) subsByUser.set(sub.user_id, [])
      subsByUser.get(sub.user_id).push(sub)
    }

    const sends = []
    const watermarkUpdates = []
    for (const [userId, entries] of byUser) {
      // Nothing settled this week - a recap saying "£0.00, 0 bets" isn't
      // worth a notification, so those users are skipped rather than sent
      // an empty one.
      if (!entries.length) continue
      const stats = computeStats(entries)
      const userSubs = subsByUser.get(userId) ?? []
      if (!userSubs.length) continue

      const sign = stats.profit >= 0 ? '+' : ''
      const numericBody = `${sign}£${stats.profit.toFixed(2)} across ${stats.settledCount} settled bets${stats.winRate === null ? '' : ` · ${stats.winRate}% win rate`}`

      // When a Claude key is configured, lead with a one-line Coach's take on
      // the week (and deep-link to the Insights tab where the full Coach lives)
      // rather than the bare numbers. Gated the same way the on-demand Coach is
      // - at least two settled bets - so we don't spend a token on a thin week.
      // requestCoachTake never throws and returns null on any trouble, so this
      // silently falls back to the numeric recap.
      let title = '📊 Your week in bets'
      let body = numericBody
      let url = '/#/tracker'
      if (ANTHROPIC_API_KEY && stats.settledCount >= 2) {
        const take = await requestCoachTake({
          summary: { settled: stats.settledCount, winRate: stats.winRate ?? undefined, profit: stats.profit, roi: stats.roi ?? undefined },
          apiKey: ANTHROPIC_API_KEY,
          style: 'push',
          route: COACH_ROUTE
        })
        if (take) {
          title = '🧠 Your week, from the Coach'
          body = take
          url = '/#/insights'
        }
      }

      // Kept in a separate array from `sends` (not counted in the
      // returned `sent` figure, which should stay a count of actual push
      // notifications) - set once we've actually decided to send this
      // user something, not for anyone skipped above (no settled bets,
      // no subscriptions), otherwise a quiet week would wrongly suppress
      // next week's real recap too.
      watermarkUpdates.push(supabase.from('profiles').update({ weekly_recap_sent_at: new Date().toISOString() }).eq('id', userId))

      const payload = JSON.stringify({ title, body, url })
      for (const sub of userSubs) {
        sends.push(
          webpush
            .sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } }, payload)
            .catch(() => null)
        )
      }
    }

    const results = await Promise.allSettled(sends)
    await Promise.allSettled(watermarkUpdates)
    return new Response(JSON.stringify({ sent: results.filter((r) => r.status === 'fulfilled').length }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ sent: 0, error: err.message }), { status: 200 })
  }
}

export const config = {
  schedule: '0 20 * * 0'
}
