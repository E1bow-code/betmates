# BetMates

Social betting tracker for a group of mates. Post your slips, compare odds
across bookmakers, and argue about the leaderboard.

**BetMates does not place bets.** It tracks wagers you log yourself and links
out to bookmakers. Stakes and results are self-reported, so the leaderboard
is only as honest as the group is.

## What it does

- **Odds** across football, horse racing, UFC and more, with live bookmaker
  deep links and odds-movement indicators
- **Groups** - shared feeds, bet slips, comments, reactions, group chat
- **Tracker** - P&L, ROI, win rate, streaks, and charts over your own bets
- **Auto-settlement** - bets settle from real results without anyone marking
  them off, including horse racing non-runners and abandoned meetings
- **Leaderboards** - monthly standings, hall of fame, achievements
- **Push notifications** - kickoff reminders, settled bets, odds alerts,
  weekly recap
- **Installable PWA** - works offline, installs to a phone home screen

## Getting started

```bash
npm install
cp .env.example .env.local   # every value is optional - see below
npm install -g netlify-cli
netlify dev                  # http://localhost:8888
```

`npm run dev` runs the UI on :5173 but leaves `/api/*` unproxied, so odds,
results and photos won't load. Use `netlify dev` unless you're only touching
presentation.

### Running with no keys at all

It works. With `.env.local` empty:

- auth, groups and the tracker run on a localStorage backend
  (`src/lib/localBackend.js`)
- odds come from the fixtures in `src/data/`
- photos, push and racing quietly do nothing

Add real keys whenever you want - nothing needs migrating, you just start
against a real backend.

`.env.example` documents every variable and what breaks without it.

## Tests

```bash
npm test
```

`node:test`, no framework. Covers the settlement and odds rules - the code
that decides what a bet pays.

## Deploying

Netlify, from `netlify.toml` (build `npm run build`, publish `dist`,
functions in `netlify/functions`). Set the same variables from
`.env.example` under **Site settings → Environment variables**.

Supabase setup: run `supabase/schema.sql` against your project. It creates
the tables, the RLS policies, and the trigger protecting `profiles.is_admin`.
Re-run it after pulling schema changes - editing the file does nothing on its
own.

## Stack

React 18, Vite 6, React Router 6, Supabase (Postgres + auth + storage),
Netlify Functions, Workbox service worker, Web Push. No CSS framework, no
state library, no TypeScript.

Odds data from [The Odds API](https://the-odds-api.com) and
[SportsGameOdds](https://sportsgameodds.com), racing from
[The Racing API](https://theracingapi.com), photos from
[Pexels](https://pexels.com).

## Responsible gambling

The app carries an 18+ gate at sign-up, a self-serve stake limit
(`src/utils/spendLimit.js`), and links to
[BeGambleAware](https://www.begambleaware.org) and GAMSTOP on the Help and
Legal pages. If you add anything that nudges a user toward staking more,
weigh it against that.

UK gambling affiliate marketing is regulated under the ASA's
[CAP Code Section 16](https://www.asa.org.uk/type/non_broadcast/code_section/16.html),
which applies to affiliates directly - read it before adding affiliate links.
