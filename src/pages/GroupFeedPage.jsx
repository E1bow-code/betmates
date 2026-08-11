import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import * as dataStore from '../lib/dataStore.js'
import BetCard from '../components/BetCard.jsx'
import VideoCard from '../components/VideoCard.jsx'
import Leaderboard from '../components/Leaderboard.jsx'
import GroupTournamentSection from '../components/GroupTournamentSection.jsx'
import GroupRecapCard from '../components/GroupRecapCard.jsx'
import GroupCoachTake from '../components/GroupCoachTake.jsx'
import PickemLeaderboard from '../components/PickemLeaderboard.jsx'
import TablePredictorPanel from '../components/TablePredictorPanel.jsx'
import Avatar from '../components/Avatar.jsx'
import ReferralTierBadge from '../components/ReferralTierBadge.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { shareOrCopy, groupInviteUrl } from '../lib/share.js'
import { useAsyncAction } from '../lib/useAsyncAction.js'
import PullToRefresh from '../components/PullToRefresh.jsx'
import SportHeroBanner from '../components/SportHeroBanner.jsx'
import CoachGptLink from '../components/CoachGptLink.jsx'

export default function GroupFeedPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [group, setGroup] = useState(null)
  const [posts, setPosts] = useState(null)
  // Server-recorded closing lines, same fetch TrackerPage.jsx/
  // InsightsPage.jsx already do per-user, scoped here to the whole group's
  // posts so Leaderboard.jsx can rank members by CLV, not just profit.
  const [closes, setCloses] = useState({})
  const [items, setItems] = useState(null) // bets + shared videos, merged and sorted
  const [members, setMembers] = useState([])
  const [memberNames, setMemberNames] = useState({})
  const [memberAvatars, setMemberAvatars] = useState({})
  const [referralCounts, setReferralCounts] = useState({})
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('feed')
  const [messages, setMessages] = useState(null)
  const [messageBody, setMessageBody] = useState('')
  const [sending, setSending] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [shareStatus, setShareStatus] = useState(null)
  const [renaming, setRenaming] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [savingDiscoverable, setSavingDiscoverable] = useState(false)
  const [removingId, setRemovingId] = useState(null)
  const runAsync = useAsyncAction()

  function refresh() {
    return Promise.all([dataStore.getGroup(id), dataStore.listBetPosts(id), dataStore.listGroupMembers(id), dataStore.listSharedInGroup(id)])
      .then(([g, betPosts, groupMembers, videos]) => {
        setGroup(g)
        setPosts(betPosts)
        setMembers(groupMembers)
        setMemberNames(Object.fromEntries(groupMembers.map((m) => [m.id, m.displayName])))
        setMemberAvatars(Object.fromEntries(groupMembers.map((m) => [m.id, m.avatarUrl])))
        setReferralCounts(Object.fromEntries(groupMembers.map((m) => [m.id, m.referralCount])))
        const merged = [
          ...betPosts.map((p) => ({ kind: 'bet', sortAt: p.createdAt, data: p })),
          ...videos.map((v) => ({ kind: 'video', sortAt: v.sharedAt, data: v }))
        ].sort((a, b) => new Date(b.sortAt) - new Date(a.sortAt))
        setItems(merged)
        const fixtureIds = betPosts.flatMap((p) => (p.selections ?? []).map((s) => s.eventId)).filter(Boolean)
        dataStore.getClosingLines(fixtureIds).then(setCloses).catch(() => {})
      })
      .catch((err) => setError(err.message))
  }

  useEffect(() => {
    refresh()
  }, [id])

  function refreshCurrentTab() {
    if (tab === 'chat') return dataStore.listGroupMessages(id).then(setMessages)
    return refresh()
  }

  async function handleLeave() {
    if (!window.confirm(`Leave "${group?.name ?? 'this group'}"? You can rejoin later with the invite code.`)) return
    setLeaving(true)
    try {
      await dataStore.leaveGroup(id, user.id)
      navigate('/groups')
    } catch (err) {
      setError(err.message)
      setLeaving(false)
    }
  }

  const isCreator = group?.createdBy === user.id

  function startRename() {
    setNameInput(group.name)
    setRenaming(true)
  }

  async function handleRename(e) {
    e.preventDefault()
    const name = nameInput.trim()
    if (!name || name === group.name) {
      setRenaming(false)
      return
    }
    setSavingName(true)
    try {
      setGroup(await dataStore.renameGroup(id, name))
      setRenaming(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingName(false)
    }
  }

  async function handleToggleDiscoverable(e) {
    const nextValue = e.target.checked
    setSavingDiscoverable(true)
    try {
      setGroup(await dataStore.setGroupDiscoverable(id, nextValue))
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingDiscoverable(false)
    }
  }

  async function handleRemoveMember(memberId, displayName) {
    if (!window.confirm(`Remove ${displayName} from "${group.name}"?`)) return
    setRemovingId(memberId)
    try {
      await dataStore.removeGroupMember(id, memberId, user.id)
      setMembers((ms) => ms.filter((m) => m.id !== memberId))
    } catch (err) {
      setError(err.message)
    } finally {
      setRemovingId(null)
    }
  }

  async function handleShareInvite() {
    let result
    const ok = await runAsync(async () => {
      result = await shareOrCopy({
        title: `Join "${group.name}" on BetMates`,
        text: `Join my group "${group.name}" on BetMates`,
        url: groupInviteUrl(group.inviteCode)
      })
    }, "Couldn't share that - try again")
    if (!ok) return
    setShareStatus(result === 'copied' ? 'Link copied' : null)
    if (result === 'copied') setTimeout(() => setShareStatus(null), 2000)
  }

  useEffect(() => {
    if (tab === 'chat' && messages === null) {
      dataStore.listGroupMessages(id).then(setMessages)
    }
  }, [tab, id])

  useEffect(() => {
    if (tab !== 'chat') return
    return dataStore.subscribeGroupMessages(id, (message) => {
      setMessages((m) => (m && m.some((x) => x.id === message.id) ? m : [...(m ?? []), message]))
    })
  }, [tab, id])

  // Feed tab has no per-item live-merge path (Leaderboard/GroupRecapCard/
  // PickemLeaderboard all need a full recompute anyway) - a new bet post
  // just re-runs the same refresh() pull-to-refresh already uses, which
  // also means the poster's own echoed INSERT is a no-op re-render rather
  // than something that needs deduping.
  useEffect(() => {
    if (tab !== 'feed') return
    return dataStore.subscribeGroupFeed(id, () => {
      refresh()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, id])

  async function handleSend(e) {
    e.preventDefault()
    const body = messageBody.trim()
    if (!body) return
    setSending(true)
    let message
    const ok = await runAsync(async () => {
      message = await dataStore.sendGroupMessage(id, user.id, body)
    }, "Couldn't send that message - try again")
    setSending(false)
    if (!ok) return
    setMessages((m) => [...(m ?? []), message])
    setMessageBody('')
  }

  return (
    <PullToRefresh onRefresh={refreshCurrentTab}>
      <SportHeroBanner sport="group" />
      <div className="topbar">
        <Link to="/groups" className="back">
          &larr; Social
        </Link>
        <h1>{group?.name ?? 'Group'}</h1>
        {group && (
          <div className="group-invite-tag">
            Invite code<span className="group-invite-code">{group.inviteCode}</span>
          </div>
        )}
        <div className="mode-switcher">
          <button className={tab === 'feed' ? 'mode-tab active' : 'mode-tab'} onClick={() => setTab('feed')}>
            Feed
          </button>
          <button className={tab === 'chat' ? 'mode-tab active' : 'mode-tab'} onClick={() => setTab('chat')}>
            Chat
          </button>
          <button className={tab === 'members' ? 'mode-tab active' : 'mode-tab'} onClick={() => setTab('members')}>
            Members
          </button>
          <button className={tab === 'predictor' ? 'mode-tab active' : 'mode-tab'} onClick={() => setTab('predictor')}>
            Predictor
          </button>
        </div>
      </div>

      {tab === 'feed' && (
        <>
          {error && <div className="error">Hmm, couldn't load this group: {error}</div>}
          {!error && items === null && <div className="loading">Catching up on the feed…</div>}
          {posts && posts.length > 0 && <GroupRecapCard posts={posts} memberNames={memberNames} />}
          {posts && posts.length > 0 && <GroupCoachTake posts={posts} memberNames={memberNames} />}
          {posts && posts.length > 0 && (
            <Leaderboard
              posts={posts}
              memberNames={memberNames}
              currentUserId={user.id}
              closes={closes}
              groupId={id}
              referralCounts={referralCounts}
            />
          )}
          {posts && posts.length > 0 && <PickemLeaderboard posts={posts} memberNames={memberNames} />}
          {posts && (
            <GroupTournamentSection
              groupId={id}
              groupName={group?.name ?? 'the group'}
              posts={posts}
              memberNames={memberNames}
              currentUserId={user.id}
              isCreator={isCreator}
            />
          )}
          {items && !items.length && (
            <EmptyState
              icon="💬"
              title="Nothing posted here yet"
              subtitle="Head to the Odds tab and tap a price to get things started."
            />
          )}

          {items && items.length > 0 && (
            <div className="bet-feed">
              {items.map((item) =>
                item.kind === 'bet' ? (
                  <BetCard key={`bet-${item.data.id}`} post={item.data} memberNames={memberNames} memberAvatars={memberAvatars} onChanged={refresh} />
                ) : (
                  <VideoCard key={`video-${item.data.id}-${item.data.sharedAt}`} post={item.data} />
                )
              )}
            </div>
          )}
        </>
      )}

      {tab === 'chat' && (
        <div className="group-chat">
          <div className="topbar-actions group-chat-actions">
            <CoachGptLink label="🧠 Ask CoachGPT" />
          </div>
          {messages === null && <div className="loading">Loading chat…</div>}
          {messages && !messages.length && (
            <EmptyState icon="💬" title="No messages yet" subtitle="Say something to get the chat going." />
          )}
          {messages && messages.length > 0 && (
            <div className="chat-messages">
              {messages.map((m) => {
                const mine = m.userId === user.id
                return (
                  <div key={m.id} className={mine ? 'chat-message chat-message-mine' : 'chat-message'}>
                    {!mine && <Avatar name={memberNames[m.userId] ?? 'Someone'} size={26} />}
                    <div className="chat-bubble">
                      {!mine && <div className="chat-author">{memberNames[m.userId] ?? 'Someone'}</div>}
                      <div>{m.body}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <form className="chat-input-row" onSubmit={handleSend}>
            <input
              placeholder="Message the group…"
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
              maxLength={500}
            />
            <button className="btn btn-primary btn-small" type="submit" disabled={sending || !messageBody.trim()}>
              Send
            </button>
          </form>
        </div>
      )}

      {tab === 'members' && (
        <div>
          {isCreator && (
            <div className="group-actions">
              {renaming ? (
                <form className="chat-input-row" onSubmit={handleRename}>
                  <input
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    maxLength={60}
                    autoFocus
                  />
                  <button className="btn btn-primary btn-small" type="submit" disabled={savingName || !nameInput.trim()}>
                    Save
                  </button>
                  <button className="btn btn-ghost btn-small" type="button" onClick={() => setRenaming(false)}>
                    Cancel
                  </button>
                </form>
              ) : (
                <button className="btn btn-secondary btn-small" onClick={startRename}>
                  Rename group
                </button>
              )}
            </div>
          )}

          {isCreator && (
            <label className="filter-toggle">
              <input
                type="checkbox"
                checked={group?.isDiscoverable ?? false}
                onChange={handleToggleDiscoverable}
                disabled={savingDiscoverable}
              />
              <span>List this group publicly in Discover</span>
            </label>
          )}

          <div className="manage-list">
            {members.map((m) => (
              <div key={m.id} className="manage-list-row">
                <span className="fixture-team">
                  <Avatar name={m.displayName} size={26} />
                  <span>
                    {m.displayName}
                    {m.id === user.id && ' (you)'}
                    <ReferralTierBadge count={m.referralCount} />
                  </span>
                </span>
                {isCreator && m.id !== user.id && (
                  <button
                    className="btn btn-ghost btn-small"
                    onClick={() => handleRemoveMember(m.id, m.displayName)}
                    disabled={removingId === m.id}
                  >
                    {removingId === m.id ? 'Removing…' : 'Remove'}
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="group-actions">
            <button className="btn btn-secondary btn-small" onClick={handleShareInvite}>
              Share invite
            </button>
          </div>
          {shareStatus && <div className="hint">{shareStatus}</div>}

          <button className="btn btn-ghost" onClick={handleLeave} disabled={leaving}>
            {leaving ? 'Leaving…' : 'Leave group'}
          </button>
        </div>
      )}

      {tab === 'predictor' && <TablePredictorPanel groupId={id} userId={user.id} memberNames={memberNames} />}
    </PullToRefresh>
  )
}
