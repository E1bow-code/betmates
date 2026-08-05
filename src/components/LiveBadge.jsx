// Small pulsing pill shown in place of a stale "KO" once an event's
// estimated live window has started (see src/utils/liveStatus.js).
export default function LiveBadge() {
  return (
    <span className="live-badge">
      <span className="live-badge-dot" />
      LIVE
    </span>
  )
}
