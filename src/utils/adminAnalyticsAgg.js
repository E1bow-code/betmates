// Shared between netlify/functions/admin-analytics.js (Supabase snake_case
// rows) and src/lib/localBackend.js (camelCase local rows) - both need to
// produce identical output shapes from different-shaped input, which is
// exactly what a shared, tested helper buys over duplicating this twice.

// Dense, zero-filled day buckets rather than a sparse map - the chart
// component indexes into a fixed-length array, and a quiet day showing as
// 0 (not a gap) is the honest picture of "last N days" anyway.
export function bucketByDay(rows, dateField, days) {
  const byDay = new Map()
  const now = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1)))
  for (let i = 0; i < days; i++) {
    const d = new Date(start)
    d.setUTCDate(start.getUTCDate() + i)
    byDay.set(d.toISOString().slice(0, 10), 0)
  }
  for (const row of rows) {
    const value = row[dateField]
    if (!value) continue
    const key = String(value).slice(0, 10)
    if (byDay.has(key)) byDay.set(key, byDay.get(key) + 1)
  }
  return [...byDay.entries()].map(([date, count]) => ({ date, count }))
}

// Counts distinct userIds among rows whose timestamp falls on/after cutoff -
// used for DAU/WAU/MAU across a combined pool of activity rows from several
// tables, so a user active in two different tables in the same window still
// only counts once.
export function distinctUsersSince(rows, cutoff) {
  const ids = new Set()
  for (const row of rows) {
    if (!row.at) continue
    if (new Date(row.at) >= cutoff) ids.add(row.userId)
  }
  return ids.size
}
