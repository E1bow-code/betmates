# Contributing to BetMates

Welcome! This guide gets you from zero to a running copy of BetMates and
explains how to submit your changes. It assumes no prior knowledge of the
project.

> **What BetMates is:** a social betting *tracker*. Groups of mates post bet
> slips, compare odds, and settle scores on a leaderboard. **The app never
> places real bets** — it tracks self-logged wagers and links out to
> bookmakers. Keep that in mind when building features.

---

## The 2-minute start (no accounts, no secrets)

BetMates is built to run with **zero configuration**. If no backend keys are
set, it automatically falls back to a browser-local mock (your data lives in
`localStorage`) and mock fixture data. That means you can start building the
UI immediately without any credentials from the project owner.

You need [Node.js **22 or newer**](https://nodejs.org) and git.

```bash
git clone https://github.com/E1bow-code/betmates.git
cd betmates
npm install
npm run dev
```

Open the URL it prints (usually <http://localhost:5173>). You now have a fully
clickable app running on mock data. **This is enough for most UI and
front-end work.**

---

## Running the full app (with the backend and APIs)

`npm run dev` runs the front-end only — any call to `/api/*` (odds, results,
photos, push) will fail because those are serverless functions. To run those
too, use the Netlify CLI:

```bash
npm install -g netlify-cli   # one time
netlify dev                  # serves the app AND the functions on :8888
```

`netlify dev` reads environment variables from a `.env` file in the project
root. Copy the template and fill in what you have:

```bash
cp .env.example .env
```

You do **not** need every value. See [Environment variables](#environment-variables)
below — most are optional and the app degrades gracefully without them.

---

## Environment variables

There are two kinds. **Never mix them up.**

### Public (safe to share, shipped in the browser bundle)

| Variable | What it's for |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous key — public by design, protected by row-level security |
| `VITE_VAPID_PUBLIC_KEY` | Public key for Web Push notifications |
| `VITE_AFFILIATE_LINKS` | Optional toggle for bookmaker affiliate links |

Ask the project owner for `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` if
you want to work against the real database instead of the mock. These are safe
to share.

### Secret (server-only — NEVER put in the client, NEVER commit, NEVER paste into chat)

| Variable | What it's for |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Full database access, bypasses row-level security |
| `VAPID_PRIVATE_KEY` | Private key for sending push notifications |
| `ODDS_API_KEY` | The Odds API (500 requests/month free tier) |
| `RACING_API_USERNAME` / `RACING_API_PASSWORD` | Horse racing data |
| `SPORTSDB_API_KEY` | TheSportsDB — team crests and player photos (a free test key works for light use) |
| `SGO_API_KEY` | Alternate sports-odds provider |
| `PEXELS_API_KEY` | Stock photos |

**You almost certainly don't need the secret keys for day-to-day work.** Every
function falls back to mock data or an empty result when its key is missing, so
the app keeps working. Only ask for a secret if a task genuinely requires it,
and get your *own* key rather than sharing one.

---

## Running the tests

```bash
npm test
```

This runs the `node:test` suite (settlement rules, odds maths, cache — ~30
tests). **CI runs these automatically on every pull request**, so a change that
breaks them can't be merged. Run them locally before you push.

> ⚠️ The most important code in the app is the bet **settlement logic** in
> `src/lib/betEvaluation.js` — it decides what every bet pays out. If you touch
> it, run `npm test` and make sure `src/lib/betEvaluation.test.js` still passes.

---

## How to submit changes

We use a **pull-request workflow** — nothing is pushed straight to `master`.

1. Make a branch:
   ```bash
   git checkout -b my-change
   ```
2. Make your edits, then run the tests:
   ```bash
   npm test
   ```
3. Commit and push your branch:
   ```bash
   git add .
   git commit -m "Short description of what you changed"
   git push origin my-change
   ```
4. On GitHub, open a **Pull Request** from your branch into `master`.
5. The owner reviews it, CI runs the tests, and once it's green it gets merged.

Keep each PR focused on one thing — it's much easier to review.

---

## How the project is laid out

```
src/api/        thin wrappers over /api/* (one per data source)
src/lib/        non-React logic: dataStore, settlement, betEvaluation, push
src/components/ shared UI components
src/pages/      one screen per route
src/utils/      pure helpers: odds maths, each-way terms, stats, formatting
src/data/       mock fixtures used whenever an API key is unset
netlify/functions/  serverless API proxies + scheduled jobs
supabase/schema.sql tables and row-level-security policies
```

A few things worth knowing before you change anything:

- **Every backend call goes through `src/lib/dataStore.js`.** It switches
  between Supabase and a `localStorage` mock depending on whether the Supabase
  keys are set. If you add a data operation, add it to **both** paths or the
  no-backend mode breaks.
- **Settlement rules live only in `src/lib/betEvaluation.js`.** Two callers
  share them and must never disagree. That file does no I/O on purpose.
- **Missing API keys degrade, they don't crash.** Keep that contract — the app
  is meant to run with zero keys.

---

## Ground rules

- **Never commit secrets** (`.env` is gitignored — keep it that way).
- **Never paste an API key, token, or password into a chat or a PR.** If one
  leaks, tell the owner so it can be rotated.
- Plain JavaScript, no TypeScript. ES modules everywhere.
- One hand-written stylesheet (`src/style.css`), no CSS framework.
- Match the existing code style and keep the existing comments — they carry
  real decisions.

Questions? Ask the project owner. Happy building! 🎯
