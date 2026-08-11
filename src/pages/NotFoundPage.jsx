import { Link } from 'react-router-dom'

// Shown for any signed-in route that doesn't exist (see App.jsx's catch-all),
// instead of silently bouncing to the dashboard - a real "this isn't a page"
// so a mistyped or stale link reads as a dead end you can back out of, not a
// confusing redirect.
export default function NotFoundPage() {
  return (
    <div className="not-found">
      <div className="not-found-code">404</div>
      <h1 className="not-found-title">That page took a walk</h1>
      <p className="not-found-body">
        We couldn&apos;t find what you were after — the link might be old, or mistyped.
      </p>
      <div className="not-found-actions">
        <Link to="/dashboard" className="btn btn-primary">
          Back to Home
        </Link>
        <Link to="/odds" className="btn btn-ghost">
          Browse the odds
        </Link>
      </div>
    </div>
  )
}
