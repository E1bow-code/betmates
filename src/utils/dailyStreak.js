// The daily "log a bet" streak - distinct from src/utils/trackerStats.js's
// computeStreak (consecutive WINS). Both streak_current_count and
// streak_last_logged_date live on profiles (see supabase/schema.sql) rather
// than being re-derived from bet history on every read, because a freeze-
// bridged gap has a real missing day in that history that a pure
// re-derivation would otherwise read as a broken streak - the persisted
// count is the only thing that remembers "that gap was covered."

const DAY_MS = 24 * 60 * 60 * 1000

function daysBetween(dateStrA, dateStrB) {
  return Math.round((Date.parse(`${dateStrB}T00:00:00Z`) - Date.parse(`${dateStrA}T00:00:00Z`)) / DAY_MS)
}

// Freezes regenerate purely off account age, capped at 3 banked - not tied
// to XP/level, since checking that would mean re-deriving a user's entire
// bet history on every single bet save just to decide freeze eligibility.
export function freezesGranted(createdAt, now = new Date()) {
  const days = Math.floor((now.getTime() - new Date(createdAt).getTime()) / DAY_MS)
  return Math.min(3, Math.floor(days / 7))
}

// Called once per bet save (dataStore.js's createBetPost/addManualEntry) -
// decides what today's log does to the streak. `today`/`lastLoggedDate` are
// 'YYYY-MM-DD' strings (UTC), matching a Postgres `date` column. Returns
// the new persisted state; `changed: false` means today was already logged
// and nothing needs writing.
export function computeStreakTransition({ currentCount, lastLoggedDate, freezesAvailable, today }) {
  if (lastLoggedDate === today) {
    return { currentCount, lastLoggedDate, freezeConsumed: false, changed: false }
  }
  const gap = lastLoggedDate ? daysBetween(lastLoggedDate, today) : null
  if (gap === 1) {
    return { currentCount: currentCount + 1, lastLoggedDate: today, freezeConsumed: false, changed: true }
  }
  if (gap === 2 && freezesAvailable > 0) {
    return { currentCount: currentCount + 1, lastLoggedDate: today, freezeConsumed: true, changed: true }
  }
  // No prior log, or too large a gap even with a freeze - today starts a
  // fresh streak rather than extending or bridging one.
  return { currentCount: 1, lastLoggedDate: today, freezeConsumed: false, changed: true }
}
