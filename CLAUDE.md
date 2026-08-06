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
npm run dev      # vite on :5173 - API calls proxy to :8888 (see vite.config.js)
netlify dev      # :8888, runs vite AND the functions - needed for anything hitting /api
npm test         # node:test, no framework installed
npm run build    # vite build + service worker
npm run preview  # serve dist/
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
Two callers share them and must never disagree: `src/lib/settlement.js`
(runs when someone opens the Tracker) and
`netlify/functions/auto-settle.js` (runs on a schedule with nobody signed
in). That file is deliberately free of I/O so a Netlify Function can import
straight out of `src/lib`. It's the only code that decides what a bet pays -
`src/lib/betEvaluation.test.js` covers it, so run `npm test` after touching it.

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
| `kickoff-reminders.js` | `*/15 * * * *` | pre-kickoff push |
| `check-odds-alerts.js` | `*/15 * * * *` | fires user odds alerts |
| `check-followed-results.js` | `*/15 * * * *` | results for followed teams/players |
| `weekly-recap.js` | `0 20 * * 0` | Sunday 20:00 recap push |

`kickoff-reminders.js` runs with nobody signed in, so it uses
`SUPABASE_SERVICE_ROLE_KEY` and bypasses RLS - the only place that's true.

## Conventions

- Plain JS, no TypeScript. ESM everywhere (`"type": "module"`).
- No CSS framework - one hand-written `src/style.css`, CSS custom properties
  for theming, `@media (prefers-color-scheme)` plus a stored override.
- No state library. Context for cross-cutting state (auth, bet slip, toasts,
  odds format), local state otherwise.
- Comments explain *why*, not what - and the existing ones carry real
  decisions and API quirks. Match that density; don't strip them.
- Money is rounded to 2dp at the point it's stored, not at display time.
