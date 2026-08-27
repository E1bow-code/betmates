import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import * as dataStore from '../lib/dataStore.js'
import { computeStats } from '../utils/trackerStats.js'
import { tipsterBadge } from '../utils/tipsterBadge.js'
import EmptyState from '../components/EmptyState.jsx'
import PullToRefresh from '../components/PullToRefresh.jsx'
import SportHeroBanner from '../components/SportHeroBanner.jsx'
import { SearchIcon, TargetIcon, BadgeCheckIcon } from '../components/icons/Icons.jsx'

const TIPSTER_BADGE_ICON = { sharp: TargetIcon, reliable: BadgeCheckIcon }

// Reached via the "Find a group" link on GroupsHomePage.jsx - joining a NEW
// public group is a different intent from managing the groups you're
// already in, so it gets its own destination instead of another segment on
// that page (this used to be SocialFeedPage.jsx's Discover segment).
export default function GroupsDiscoverPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [discoverGroups, setDiscoverGroups] = useState(null)
  // Tipster badge per priced row, keyed by group id (not owner id - two
  // priced groups could share an owner). Free groups never get an entry.
  const [ownerBadges, setOwnerBadges] = useState({})
  const [search, setSearch] = useState('')
  const [joiningId, setJoiningId] = useState(null)

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function refresh() {
    return dataStore.listDiscoverableGroups(user.id).then((groups) => {
      setDiscoverGroups(groups)
      const priced = groups.filter((g) => g.priceAmount)
      if (!priced.length) return
      // Same fetch -> filter-to-public -> computeStats -> tipsterBadge
      // pattern BetBuilderSheet's notifyPublicFollowers() uses to badge a
      // push notification, applied here to a group owner instead of the
      // poster - re-filtered client-side rather than trusting RLS alone, so
      // a badge never reflects group-private picks.
      return Promise.all(
        priced.map((g) =>
          dataStore.listBetPostsByUser(g.createdBy).then((posts) => {
            const stats = computeStats(posts.filter((p) => p.visibility === 'public' && !p.stakeHidden))
            return [g.id, tipsterBadge(stats)]
          })
        )
      ).then((entries) => setOwnerBadges(Object.fromEntries(entries.filter(([, badge]) => badge))))
    })
  }

  async function handleJoin(group) {
    setJoiningId(group.id)
    try {
      const joined = await dataStore.joinGroupById(group.id, user.id)
      showToast(`Joined ${joined.name}`)
      navigate(`/groups/${joined.id}`)
    } catch (err) {
      showToast(err.message)
      setJoiningId(null)
    }
  }

  const q = search.trim().toLowerCase()
  const filtered = discoverGroups && (q ? discoverGroups.filter((g) => g.name.toLowerCase().includes(q)) : discoverGroups)

  return (
    <PullToRefresh onRefresh={refresh}>
      <SportHeroBanner sport="social" />
      <div className="topbar">
        <Link to="/groups" className="back">
          &larr; Groups
        </Link>
        <h1>Find a group</h1>
      </div>

      <p className="hint">Find a public group to join - no invite code needed.</p>
      <input
        className="search-input"
        type="search"
        placeholder="Search groups by name…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {discoverGroups === null && <div className="loading">Finding public groups…</div>}

      {discoverGroups && !discoverGroups.length && (
        <EmptyState
          icon={<SearchIcon width={26} height={26} />}
          title="No public groups yet"
          subtitle="Nobody's made a group discoverable yet - check back later, or start your own."
        />
      )}

      {filtered && discoverGroups.length > 0 && !filtered.length && (
        <EmptyState icon={<SearchIcon width={26} height={26} />} title="No matches" subtitle={`Nothing found for "${search.trim()}".`} />
      )}

      {filtered && filtered.length > 0 && (
        <div className="discover-group-list">
          {filtered.map((g) => (
            <div key={g.id} className="discover-group-row">
              <div className="discover-group-row-main">
                <div className="discover-group-row-name">
                  {g.name}
                  {g.priceAmount && (
                    <span className="chip chip--pill chip--sm chip--filled-accent-strong discover-group-price-badge">
                      £{Number(g.priceAmount).toFixed(2)}/mo
                    </span>
                  )}
                  {ownerBadges[g.id] &&
                    (() => {
                      const BadgeIcon = TIPSTER_BADGE_ICON[ownerBadges[g.id].icon]
                      return (
                        <span className="chip chip--pill chip--sm chip--filled-neutral discover-group-tipster-badge icon-row">
                          {BadgeIcon && <BadgeIcon width={13} height={13} />} {ownerBadges[g.id].label}
                        </span>
                      )
                    })()}
                </div>
                <div className="discover-group-row-meta">
                  {g.memberCount} member{g.memberCount === 1 ? '' : 's'}
                </div>
              </div>
              {g.priceAmount ? (
                <button className="btn btn-primary btn-small" onClick={() => navigate(`/join/${g.inviteCode}`)}>
                  Join
                </button>
              ) : (
                <button className="btn btn-primary btn-small" onClick={() => handleJoin(g)} disabled={joiningId === g.id}>
                  {joiningId === g.id ? 'Joining…' : 'Join'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </PullToRefresh>
  )
}
