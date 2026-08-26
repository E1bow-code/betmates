import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useActivity } from '../context/ActivityContext.jsx'
import * as dataStore from '../lib/dataStore.js'
import BetCard from '../components/BetCard.jsx'
import ManageSheet from '../components/ManageSheet.jsx'
import GroupVsGroupSheet from '../components/GroupVsGroupSheet.jsx'
import EmptyState from '../components/EmptyState.jsx'
import InviteMatesButton from '../components/InviteMatesButton.jsx'
import PullToRefresh from '../components/PullToRefresh.jsx'
import SportHeroBanner from '../components/SportHeroBanner.jsx'
import MatesSwitcher from '../components/MatesSwitcher.jsx'
import { CommentIcon, SearchIcon, PeopleIcon, SwordsIcon, BellOffIcon } from '../components/icons/Icons.jsx'

// The Groups side of the Mates tab (see components/MatesSwitcher.jsx for the
// Groups/Friends split - Friends lives at src/pages/FriendsPage.jsx). One
// merged timeline across every group the user is in - creating/joining a
// group and the invite-code list live behind the Manage sheet instead of
// sitting above the feed, so the feed is what you actually see when you open
// this tab. Finding a NEW public group to join is a separate destination
// (GroupsDiscoverPage.jsx, one tap away via "Find a group" below) rather
// than another segment on this page - it's about growing your groups, not
// part of the groups you're already in. This page used to be
// SocialFeedPage.jsx, a 9-segment mega-page also covering Friends and
// several unrelated global rankings/content segments - those moved to
// FriendsPage.jsx and ExplorePage.jsx respectively.
export default function GroupsHomePage() {
  const { user } = useAuth()
  const { markSeen, hasUnseenMessages } = useActivity()
  const [groups, setGroups] = useState(null)
  const [feed, setFeed] = useState(null)
  const [showManage, setShowManage] = useState(false)
  const [showGroupCompare, setShowGroupCompare] = useState(false)

  useEffect(() => {
    refresh()
    markSeen()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function refresh() {
    return Promise.all([dataStore.listMyGroups(user.id).then(setGroups), dataStore.listFeedForUser(user.id).then(setFeed)])
  }

  return (
    <PullToRefresh onRefresh={refresh}>
      <SportHeroBanner sport="social" />
      <div className="topbar">
        <div className="topbar-row">
          <h1>Groups</h1>
          <div className="topbar-actions">
            <Link className="icon-btn" to="/messages" aria-label={`Messages${hasUnseenMessages ? ' - unread' : ''}`}>
              <CommentIcon width={16} height={16} />
              {hasUnseenMessages && <span className="pill-dot" />}
            </Link>
            <button className="btn btn-ghost btn-small" onClick={() => setShowManage(true)}>
              Groups
            </button>
          </div>
        </div>
        <MatesSwitcher />
      </div>

      <div className="group-actions">
        <Link to="/groups/discover" className="btn btn-ghost btn-small icon-row">
          <SearchIcon width={14} height={14} /> Find a group
        </Link>
        {groups && groups.length > 1 && (
          <button className="btn btn-ghost btn-small icon-row" onClick={() => setShowGroupCompare(true)}>
            <SwordsIcon width={15} height={15} /> Compare groups
          </button>
        )}
      </div>

      {groups === null && <div className="loading">Loading your groups…</div>}

      {groups && !groups.length && (
        <EmptyState
          icon={<PeopleIcon width={26} height={26} />}
          title="No groups yet"
          subtitle="Create one for your mates, or join with an invite code, to start sharing bets."
          action={
            <>
              <button className="btn btn-primary" onClick={() => setShowManage(true)}>
                Create or join a group
              </button>
              <InviteMatesButton name={user.displayName} friendCode={user.friendCode} label="Invite mates" className="btn btn-ghost" />
              <Link to="/dashboard" className="btn btn-ghost">
                Browse the public feed on Home
              </Link>
            </>
          }
        />
      )}

      {groups && groups.length > 0 && (
        <div className="group-chip-row">
          {groups.map((g) => (
            <Link key={g.id} to={`/groups/${g.id}`} className="chip chip--pill chip--outline group-chip">
              {g.name}
            </Link>
          ))}
        </div>
      )}

      {feed === null && groups?.length > 0 && <div className="loading">Catching up on the latest bets…</div>}
      {feed && groups?.length > 0 && !feed.length && (
        <EmptyState
          icon={<BellOffIcon width={26} height={26} />}
          title="Quiet in here so far"
          subtitle="Head to the Odds tab and tap a price to get the first bet posted."
        />
      )}

      {feed && feed.length > 0 && (
        <div className="bet-feed">
          {feed.map((post) => (
            <BetCard key={post.id} post={post} memberNames={post.memberNames} memberAvatars={post.memberAvatars} onChanged={refresh} />
          ))}
        </div>
      )}

      {showManage && <ManageSheet groups={groups} onChanged={refresh} onClose={() => setShowManage(false)} />}
      {showGroupCompare && groups?.length > 1 && <GroupVsGroupSheet groups={groups} onClose={() => setShowGroupCompare(false)} />}
    </PullToRefresh>
  )
}
