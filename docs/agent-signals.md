# Agent signals → Discord

The BetMates "agent ecosystem" is a set of scheduled Netlify functions that each
post a short, persona-branded line to Discord when something real happens. They
map the pixel-art *BetMates Ops* cast onto genuine backend signals — every one is
grounded in real data or in fact-checked, cited web research, never an invented
feed.

**Everything here is dormant by default.** Each signal no-ops until its
credentials are set (the "missing keys degrade, don't crash" contract), so
merging the agents changes nothing until you opt in. Nothing here places a bet,
predicts a result, or tips — the research agents surface *context*, the same
never-tip rule the Coach follows.

## The cast

| Agent | Role | Signal | Grounded in | Gated on |
|---|---|---|---|---|
| **Dex** | Data Engineer | settlement summary; CI-red alert | `auto-settle.js`; GitHub Actions | `DISCORD_WEBHOOK_URL` |
| **CoachGPT** | The Coach | grading record update | `coach-settle.js` | `DISCORD_WEBHOOK_URL` |
| **Mira** | Odds Analyst | odds-alert hits (biggest led) | `alert-checks.js` / `odds_alerts` | `DISCORD_WEBHOOK_URL` |
| **Priya** | Compliance | spend-limit escalations | `alert-checks.js` / spend limits | `DISCORD_WEBHOOK_URL` |
| **Coco** | Social Media Mgr | daily promo post → approve → X | `social-propose.js` + interactions | Discord bot + X keys |
| **Sage** | Research & Ideas | fact-checked idea (web **and** the site) → approve → GitHub issue | `sage-propose.js` (Claude + web_search + `gatherSiteContext`) | Anthropic key + Discord bot |
| **Nova** | Markets Trader | biggest sharp-money move | `odds-snapshot.js` / `odds_snapshots` | `DISCORD_WEBHOOK_URL` |
| **Bea** | Community | group member-count milestone | `community-pulse.js` / `groups` | `DISCORD_WEBHOOK_URL` |

## How each is grounded (no invented feeds)

- **Nova** reuses `src/utils/sharpMoney.js` — the one place in the app that reads
  a price's own history — over the `odds_snapshots` rows `odds-snapshot.js`
  already records, and posts the single biggest qualifying move each run. Pure
  detection lives in `src/lib/marketSteam.js` (`biggestSharpMove`).
- **Bea** watches `groups.member_count` and announces round-number milestones
  (5, 10, 25, 50, 100, …). Pure logic in `src/lib/communityMilestone.js`; dedupe
  via `groups.last_member_milestone` so each milestone fires once.
- **Sage** is the single research/ideas agent. It grounds each proposal in TWO
  real sources: **the web** (Claude's `web_search` tool, cited) and **the site**
  — a compact snapshot of live BetMates signals (real usage, user feedback/
  reports, and where the product is thin) gathered from the DB by
  `gatherSiteContext` in `sage-propose.js`. Prompt/parse in
  `src/lib/sageResearch.js`. (The old separate "research desk" of matchday-brief
  agents was folded into Sage — one researcher, not a swarm.)

Sage reuses the Coach's Anthropic credentials (`COACH_ANTHROPIC_KEY`, or
OmniRoute) and the global daily spend breaker (`src/lib/llmBudget.js`), exactly
like `coach.js`.

## Turning them on

1. **The simple signals** (Dex, CoachGPT, Mira, Priya, Nova, Bea) only need an
   incoming Discord webhook: set `DISCORD_WEBHOOK_URL` (and, for the CI-red
   alert, the same value as a GitHub repo secret). See the notifier at
   `src/lib/discordNotify.js`.
2. **Sage** additionally needs the Anthropic key (`COACH_ANTHROPIC_KEY` or
   OmniRoute).
3. **Coco + Sage's buttons** need the full Discord *bot* app and interactions
   endpoint — see [`social-agent-setup.md`](./social-agent-setup.md) and
   [`sage-agent-setup.md`](./sage-agent-setup.md).
4. **Apply the schema.** The tables (`social_posts`, `idea_proposals`,
   `agent_settings`) and the `groups.last_member_milestone` column in
   `supabase/schema.sql` only take effect once applied to the live database.

## Cadence

All schedules are in each function's `config.schedule` (and the table in
`CLAUDE.md`). Per the pre-launch cost note, the `*/30` jobs are dialled down to
once daily while there are no real users; the agent-briefing jobs
(`community-pulse`, `sage-propose`, `social-propose`) are
daily by design. Most agents have essentially nothing to say without real users
and real activity, so they stay quiet until BetMates is live.
