import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import * as dataStore from '../lib/dataStore.js'

// Landing spot for a shared invite link (see src/lib/share.js's
// groupInviteUrl) once the user is signed in - joins the group and drops
// them straight into it, rather than making them copy-paste a code into
// the Manage sheet by hand.

export default function JoinGroupPage() {
  const { code } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState(null)

  useEffect(() => {
    dataStore
      .joinGroupByCode(code, user.id)
      .then((group) => navigate(`/groups/${group.id}`, { replace: true }))
      .catch((err) => setError(err.message))
  }, [code, user.id])

  if (error) {
    return (
      <div>
        <div className="topbar">
          <h1>Couldn't join</h1>
        </div>
        <div className="error">{error}</div>
        <Link className="btn btn-secondary" to="/groups">
          Back to Social
        </Link>
      </div>
    )
  }

  return <div className="loading">Joining the group…</div>
}
