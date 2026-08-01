// Shared empty-state layout: icon + short title + supporting line, used
// wherever a list has nothing in it yet (Odds, Social, Tracker). Replaces
// plain italic text so a first-run/quiet screen still feels intentional.

export default function EmptyState({ icon, title, subtitle, action }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">{icon}</div>
      {title && <div className="empty-state-title">{title}</div>}
      {subtitle && <div className="empty-state-subtitle">{subtitle}</div>}
      {action}
    </div>
  )
}
