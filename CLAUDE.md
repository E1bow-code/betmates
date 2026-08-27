# BetMates

Social betting tracker. Groups of mates post bet slips, compare odds, and
settle scores on a leaderboard. **The app never places real bets** - it
tracks self-logged wagers and shows odds with outbound links to bookmakers.
That framing decides a lot of the design: "rebet" just logs the same
selections again, stakes are user-entered, and the leaderboard is
trust-based by design.

React 18 + Vite 6 SPA, Supabase for data/auth, Netlify Functions for
anything needing a secret. Installable PWA with Web Push.

## Commands

```bash
npm run dev       # vite on :5173 - API calls proxy to :8888 (see vite.config.js)
netlify dev       # :8888, runs vite AND the functions - needed for anything hitting /api
npm test          # node:test, no framework installed
npm run typecheck # tsc --noEmit over files opted into checking (see Conventions)
npm run build     # vite build + service worker
npm run preview   # serve dist/
```

`npm run dev` alone gives you the UI but every `/api/*` call fails - use
`netlify dev` when touching odds, results, photos, or push.

## Layout

```
src/api/        thin fetch wrappers over /api/* (one per data source)
src/lib/        non-React logic: dataStore, settlement, betEvaluation, push
src/components/ shared UI
src/pages/      one per route (all lazy-loaded - see App.jsx)
src/utils/      pure helpers: odds maths, each-way terms, stats, formatting
src/data/       mock fixtures used whenever an API key is unset
netlify/functions/  API proxies (keep keys server-side) + scheduled jobs
supabase/schema.sql tables, RLS policies, the admin-flag trigger
```

## Things worth knowing before changing anything

**Every backend call goes through `src/lib/dataStore.js`.** It switches
between Supabase and `src/lib/localBackend.js` (a localStorage mock) on
whether `VITE_SUPABASE_*` is set, so the app is fully usable with no
backend at all. Add a data operation in *both* or the no-backend path
breaks silently.

**Settlement rules live in `src/lib/betEvaluation.js` and nowhere else.**
Three callers share them and must never disagree: `src/lib/settlement.js`
(runs when someone opens the Tracker), `netlify/functions/auto-settle.js`
(runs on a schedule with nobody signed in), and
`netlify/functions/coach-settle.js` (settles CoachGPT's own
`lock_in_recommendation` picks for its scoreboard, reusing `evaluateLeg`
directly against a recommendation leg rather than a real bet's `selections`
array). That file is deliberately free of I/O so a Netlify Function can
import straight out of `src/lib`. It's the only code that decides what a
bet pays - `src/lib/betEvaluation.test.js` covers it, so run `npm test`
after touching it.

**Void legs re-price the bet.** A void leg in a winning multi goes to odds
1.00 and the accumulator is re-priced (`voidAdjustedReturn`), rather than
paying at the price it was struck at. Both settle paths apply it.

**`potential_return` is the payout, not a derived value.** It's written at
bet time and corrected on settlement (void legs, each-way places). P&L reads
it directly, so anything that settles a bet at a non-standard payout has to
write the corrected figure.

**Missing API keys degrade, they don't crash.** Each function falls back to
`src/data/mock*` or an empty list and sets an `x-data-source: mock` header.
Keep that contract - the app is meant to run with zero keys configured.

**Free API tiers are the constraint.** The Odds API is 500 req/month, which
is why `src/lib/apiCache.js` sits in front of every proxy. Don't add a
client-side poll without checking what it costs per user per day.

**RLS is the only access control.** The Supabase anon key ships in the
client bundle by design. Anything not enforced by a policy in
`supabase/schema.sql` is not enforced. Editing that file does nothing until
it's applied to the live database.

**`profiles.is_admin` is trigger-protected.** RLS is row-level and can't
stop one column being written, so a trigger pins `is_admin` for any request
arriving as `anon`/`authenticated`. Grant admin with the service-role key or
direct SQL.

## Scheduled functions

Netlify cron, configured per-file via `export const config = { schedule }`:

| Function | Schedule | Does |
|---|---|---|
| `auto-settle.js` | `*/30 * * * *` | settles open bets, pushes "bet settled" |
| `alert-checks.js` | `*/30 * * * *` | pre-kickoff push, odds alerts, results for followed teams/players, spend-limit buddy alerts, BetMates Plus trial-ending reminder, paid-group renewal reminder (merged - see file header; dropped from `*/15` to `*/30` to cut credit usage pre-launch) |
| `weekly-recap.js` | `0 20 * * 0` | Sunday 20:00 recap push |
| `streak-reminders.js` | `*/30 * * * *` | push on a new 3/5/10 win-streak milestone; also nudges (once daily, 19:00 UTC) when the daily log-in streak is about to lapse |
| `team-news-alerts.js` | `*/30 * * * *` | push when a followed team/player appears in a news headline |
| `odds-snapshot.js` | `*/30 * * * *` | snapshots prices for open-bet legs (CLV) and followed fixtures (sharp-money) |
| `coach-settle.js` | `*/30 * * * *` | settles CoachGPT's `lock_in_recommendation` picks for its own scoreboard |
| `season-rollover.js` | `0 0 1 * *` | archives last month's #1-by-profit into `season_results`, per group and globally |
| `odds-ingest.js` | `0 */8 * * *` | fetches the football bulk list and writes it to `odds_cache` so `odds.js` serves users from our own DB, not per-user live calls |
| `ufc-ingest.js` | `0 */8 * * *` | same, for the UFC/MMA list (`ufc.js`) |
| `sport-ingest.js` | `0 */12 * * *` | same, per generic sport (`sport.js`); `ODDS_INGEST_SPORTS` allowlists which - NOT free-tier-safe with all nine on, see file header |

`alert-checks.js` (and every other scheduled function above) runs with
nobody signed in, so it uses `SUPABASE_SERVICE_ROLE_KEY` and bypasses RLS -
the only place that's true.

`alert-checks.js` used to be three separate `*/15 * * * *` functions
(kickoff reminders, odds alerts, followed-fixture results) - merged into
one to cut Netlify usage-credit consumption from three cron invocations
every 15 minutes down to one, same frequency and behavior either way.

## Conventions

- Plain JS/JSX source (no `.ts`/`.tsx`), ESM everywhere (`"type": "module"`).
  TypeScript is present as a dev-only checking tool, not a source language -
  `tsconfig.json` has `checkJs` off by default, so a file is only
  type-checked if it opts in with a `// @ts-check` comment at the top. Only
  add that pragma to a file once it's actually clean; the settlement path
  (`betEvaluation.js`, `settlement.js`, `eachWay.js`) and both halves of
  the data layer (`dataStore.js`, `localBackend.js`) are opted in today -
  the latter reuses the former's typedefs via `@typedef {import(...)}`
  rather than redeclaring them, since local mode's records use the same
  camelCase shape the UI expects. Run `npm run typecheck` before adding the pragma
  elsewhere - most untyped JS throws inference noise (arithmetic on
  loosely-typed values, component prop shapes) that isn't a real bug, so
  opting in file-by-file keeps the tool actually green rather than
  permanently red. `netlify/functions/` runs under a second, sibling
  `netlify/functions/tsconfig.json` (Node globals via `@types/node`, no DOM
  lib) rather than the root config, since it's a different runtime context
  from `src/` - `npm run typecheck` runs both. `auto-settle.js` and
  `alert-checks.js` are opted in today, both typed against the raw
  snake_case Postgrest rows they actually select (`SettleRow`,
  `DueBetRow`/`OddsAlertRow`/etc.), not `dataStore.js`'s camelCase
  `BetPost`/`ManualEntry` - and both keep the `supabase` client itself typed
  as `any`, since the real `SupabaseClient` generic (no `Database` type
  configured) makes `.update()` resolve to `never` on a non-literal table
  name.
- No CSS framework - one hand-written `src/style.css`, CSS custom properties
  for theming, `@media (prefers-color-scheme)` plus a stored override.
- No state library. Context for cross-cutting state (auth, bet slip, toasts,
  odds format), local state otherwise.
- Comments explain *why*, not what - and the existing ones carry real
  decisions and API quirks. Match that density; don't strip them.
- Money is rounded to 2dp at the point it's stored, not at display time.
