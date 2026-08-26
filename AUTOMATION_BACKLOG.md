# BetMates automation backlog

The weekly **BetMates keeper** routine reads this file each run and works the
topmost unchecked item: it implements it on a fresh branch and opens a PR for
you to review and merge. It never merges or deploys anything itself.

## How to use it

- Add tasks below as unchecked checklist items (`- [ ]`), most important at the
  top.
- Keep each task **small and self-contained** — roughly one PR's worth of work.
  "Add a copied-confirmation toast to Copy Bet" is a good size; "rebuild the
  Tracker" is not.
- The routine ticks an item (`- [x]`) in the PR it opens for it, so the box
  gets checked when you merge that PR.
- Anything the routine can't safely do on its own (needs live data, a design
  decision, a Netlify/Supabase change) it will leave unchecked and explain in
  its run summary instead.

## Tasks

- [ ] Add unit tests for `src/utils/format.js` — cover `formatRelativeTime` (just now, minutes, hours, days, weeks, and a future timestamp) and the other exported pure helpers. Tests only, no behaviour change.
- [ ] When **Copy Bet** is tapped on a feed card, show a confirmation toast (e.g. "Added to your bet slip ✓") using the existing ToastContext — but only if it doesn't already give clear visual feedback. Keep the change scoped to `CopyBetButton.jsx`.

## Done

<!-- Ticked items collect here over time as their PRs merge. -->
