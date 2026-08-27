// Pure builder for the weekly leaderboard email digest. No I/O here - the
// scheduled netlify/functions/weekly-leaderboard-email.js does the Supabase
// reads and the Resend send; this just turns prepared data into { subject,
// html } (or null when there's nothing worth emailing), so the whole
// render is unit-testable without a network or a key. Email HTML is
// deliberately table-based with inline styles - the only thing that
// survives across Gmail/Outlook/Apple Mail.

const NAVY = '#234b7a'
const INK = '#1a1c20'
const MUTED = '#6a6d76'
const GREEN = '#157a45'
const BAD = '#b04a2a'
const LINE = '#e6e3da'
const BG = '#f6f5f1'

// Money to a signed "£12.34" / "-£5.00", matching how P&L reads elsewhere.
export function money(n) {
  const v = Math.round((Number(n) || 0) * 100) / 100
  const sign = v < 0 ? '-' : ''
  return `${sign}£${Math.abs(v).toFixed(2)}`
}

function medal(rank) {
  return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`
}

function rowHtml(row) {
  const you = row.isRecipient
  const bg = you ? '#eef3fb' : '#ffffff'
  const nameWeight = you ? '700' : '500'
  const profitColor = (Number(row.profit) || 0) >= 0 ? GREEN : BAD
  const youTag = you ? ` <span style="color:${NAVY};font-weight:700">(you)</span>` : ''
  return `<tr>
    <td style="padding:9px 12px;border-bottom:1px solid ${LINE};background:${bg};font-size:15px;width:36px;text-align:center">${medal(row.rank)}</td>
    <td style="padding:9px 12px;border-bottom:1px solid ${LINE};background:${bg};font-size:15px;color:${INK};font-weight:${nameWeight}">${escapeHtml(row.name)}${youTag}</td>
    <td style="padding:9px 12px;border-bottom:1px solid ${LINE};background:${bg};font-size:15px;color:${profitColor};font-weight:700;text-align:right;font-variant-numeric:tabular-nums">${money(row.profit)}</td>
    <td style="padding:9px 12px;border-bottom:1px solid ${LINE};background:${bg};font-size:13px;color:${MUTED};text-align:right;white-space:nowrap">${row.settledCount} bet${row.settledCount === 1 ? '' : 's'}</td>
  </tr>`
}

function groupSectionHtml(group) {
  const rows = group.rows.map(rowHtml).join('')
  const leader = group.rows[0]
  const leaderLine = leader
    ? `<p style="margin:0 0 10px;font-size:14px;color:${MUTED}">${escapeHtml(leader.name)} leads with <span style="color:${GREEN};font-weight:700">${money(leader.profit)}</span> this week.</p>`
    : ''
  return `<div style="margin:0 0 26px">
    <h2 style="margin:0 0 6px;font-size:18px;color:${INK}">${escapeHtml(group.name)}</h2>
    ${leaderLine}
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;border:1px solid ${LINE};border-radius:8px;overflow:hidden">
      ${rows}
    </table>
  </div>`
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

// The BetMates mark (the slip-and-check logo) as inline SVG, so the header
// carries the brand without an external image an email client might block.
const MARK = `<svg width="30" height="30" viewBox="0 0 100 100" style="vertical-align:middle">
  <rect width="100" height="100" rx="22" fill="#ffffff" opacity="0.14"/>
  <rect x="28" y="23" width="44" height="54" rx="7" fill="#ffffff"/>
  <circle cx="28" cy="37" r="3.4" fill="${NAVY}"/><circle cx="28" cy="50" r="3.4" fill="${NAVY}"/><circle cx="28" cy="63" r="3.4" fill="${NAVY}"/>
  <path d="M37 51 L45 59 L64 36" fill="none" stroke="#12a150" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`

// Builds the digest for ONE recipient. `groups` is [{ name, rows }] where each
// row is { name, rank, profit, settledCount, winRate, isRecipient }. Only
// groups that actually had settled activity this week should be passed in;
// returns null when there's nothing to send (no groups with rows), so the
// caller simply skips emailing that person rather than sending an empty board.
export function buildLeaderboardDigest({ recipientName, weekLabel, groups }) {
  const active = (groups ?? []).filter((g) => g.rows && g.rows.length > 0)
  if (!active.length) return null

  // A useful subject: name the group when there's one, otherwise the count.
  const subject =
    active.length === 1 ? `${active[0].name} — this week's leaderboard` : `Your ${active.length} BetMates leaderboards this week`

  const sections = active.map(groupSectionHtml).join('')
  const hello = recipientName ? `${escapeHtml(recipientName)}, here's` : `Here's`

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:${BG}">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${BG}">
    <tr><td align="center" style="padding:24px 12px">
      <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
        <tr><td style="background:${NAVY};border-radius:14px 14px 0 0;padding:20px 24px">
          <span style="display:inline-block;vertical-align:middle">${MARK}</span>
          <span style="color:#fff;font-size:19px;font-weight:800;letter-spacing:.01em;vertical-align:middle;margin-left:10px">BetMates</span>
          <div style="color:#c7d6ea;font-size:13px;margin-top:8px">${hello} how last week landed with your mates.</div>
          ${weekLabel ? `<div style="color:#9db6d4;font-size:12px;margin-top:2px">Week of ${escapeHtml(weekLabel)}</div>` : ''}
        </td></tr>
        <tr><td style="background:#ffffff;padding:24px 24px 12px">
          ${sections}
        </td></tr>
        <tr><td style="background:#ffffff;border-radius:0 0 14px 14px;padding:6px 24px 22px;border-top:1px solid ${LINE}">
          <p style="margin:14px 0 0;font-size:12px;color:${MUTED};line-height:1.5">Ranked by settled profit over the last 7 days. BetMates never places a real bet — it just keeps the score.</p>
          <p style="margin:8px 0 0;font-size:12px;color:${MUTED}">Don't want these? Turn off <b>Weekly leaderboard email</b> in Account → Notifications.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`

  return { subject, html }
}
