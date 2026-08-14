import { Link } from 'react-router-dom'

// The shared "make this name clickable" primitive - links to a person's
// profile (/user/:id) when their real user id is in scope, degrades to a
// plain span otherwise (the id genuinely isn't always available - a live
// composer's own preview, say - so this stays optional rather than
// throwing). Not a wrapper around Avatar: several call sites render an
// avatar and a name as separate siblings rather than adjacent, so keeping
// this single-purpose lets each call site decide what's inside the link.
export default function UserLink({ id, displayName, className, children }) {
  if (!id) return <span className={className}>{children ?? displayName}</span>
  return (
    <Link to={`/user/${id}`} className={className}>
      {children ?? displayName}
    </Link>
  )
}
