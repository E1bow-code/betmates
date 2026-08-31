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
import UserLink from '../components/UserLink.jsx'
import GoProSheet from '../components/GoProSheet.jsx'
import ReferralTierBadge from '../components/ReferralTierBadge.jsx'
import EmptyState from '../components/EmptyState.jsx'
import GroupColdStart from '../components/GroupColdStart.jsx'
import GroupConsensusCard from '../components/GroupConsensusCard.jsx'
import { computeGroupConsensus } from '../utils/groupConsensus.js'
import { shareOrCopy, groupInviteUrl } from '../lib/share.js'
import { notifyGroup } from '../lib/notify.js'
import { useAsyncAction } from '../lib/useAsyncAction.js'
import PullToRefresh from '../components/PullToRefresh.jsx'
import SportHeroBanner from '../components/SportHeroBanner.jsx'
import CollapsibleSection from '../components/CollapsibleSection.jsx'
import CoachGptLink from '../components/CoachGptLink.jsx'
import { startConnectOnboarding } from '../api/groupBillingClient.js'
import { computeGroupEarnings } from '../utils/groupEarnings.js'
import { groupSubscribersToCsv, downloadCsv } from '../lib/csvExport.js'
import { CommentIcon } from '../components/icons/Icons.jsx'

const EXTRAS_EXPANDED_KEY = 'betmates:groupExtrasExpanded'

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
  const [priceInput, setPriceInput] = useState('')
  const [savingPrice, setSavingPrice] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState(null)
  const [subscribers, setSubscribers] = useState(null)
  const [showGoPro, setShowGoPro] = useState(false)
  // Recap/Coach's take/Leaderboard/Pick'em/Tournament - collapsed by
  // default so the feed itself (why you're actually here) is the first
  // thing you see, not five stacked widgets above it. Remembered per
  // browser once opened, same idea as AccountPage's own group-expansion
  // memory, not per-group - it's a "do I want to see this stuff" habit,
  // not something that varies group to group.
  const [extrasOpen, setExtrasOpen] = useState(() => localStorage.getItem(EXTRAS_EXPANDED_KEY) === '1')
  const runAsync = useAsyncAction()

  function toggleExtras() {
    setExtrasOpen((open) => {
      const next = !open
      localStorage.setItem(EXTRAS_EXPANDED_KEY, next ? '1' : '0')
      return next
    })
  }

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
    // Reset the chat on a group change: the chat loader below only fetches
    // when messages === null, so without this an in-place /groups/A -> /groups/B
    // switch (component stays mounted) would keep showing group A's chat while
    // the resubscribed socket appends group B's live messages onto it. posts/
    // items don't need this - refresh() refetches them unconditionally here.
    setMessages(null)
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

  useEffect(() => {
    if (isCreator && group?.priceAmount) dataStore.listGroupSubscribers(id).then(setSubscribers)
  }, [isCreator, group?.priceAmount, id])

  useEffect(() => {
    if (group?.priceAmount) setPriceInput(String(group.priceAmount))
  }, [group?.priceAmount])

  async function handleConnectPayouts() {
    setConnecting(true)
    setConnectError(null)
    const accessToken = await dataStore.getAccessToken()
    const res = await startConnectOnboarding({ accessToken, groupId: id })
    if (res.url) {
      window.location.href = res.url
      return
    }
    setConnecting(false)
    setConnectError(res.configured === false ? "Payouts aren't set up yet - check back soon." : res.error || 'Something went wrong - try again.')
  }

  function handleExportSubscribers() {
    const date = new Date().toISOString().slice(0, 10)
    downloadCsv(`betmates-${group.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-subscribers-${date}.csv`, groupSubscribersToCsv(subscribers))
  }

  async function handleSavePrice(e) {
    e.preventDefault()
    const trimmed = priceInput.trim()
    const amount = trimmed ? Number(trimmed) : null
    if (trimmed && (!Number.isFinite(amount) || amount <= 0)) return
    setSavingPrice(true)
    try {
      setGroup(await dataStore.setGroupPrice(id, amount))
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingPrice(false)
    }
  }

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
    // Dedup by id like the realtime subscription above: the insert echoes back
    // over the socket, and if it beats this response the message is already in
    // state - an unconditional append would render it twice.
    setMessages((m) => (m && m.some((x) => x.id === message.id) ? m : [...(m ?? []), message]))
    setMessageBody('')
    // Gated on 'groupChat' (opt-out, defaults on) rather than sent
    // unconditionally like DirectMessagePage's notifyFriend - a group chat
    // can get busy with several people talking at once, unlike a 1:1 DM.
    notifyGroup(
      id,
      {
        title: `${user.displayName} messaged in ${group?.name ?? 'the group'}`,
        body,
        url: `/groups/${id}`
      },
      user.id,
      'groupChat'
    )
  }

  return (
    <PullToRefresh onRefresh={refreshCurrentTab}>
      <SportHeroBanner sport="group" />
      <div className="topbar">
        <Link to="/groups" className="back">
          &larr; Groups
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
          {isCreator && (
            <button className={tab === 'settings' ? 'mode-tab active' : 'mode-tab'} onClick={() => setTab('settings')}>
              Settings
            </button>
          )}
        </div>
      </div>

      {tab === 'feed' && (
        <>
          {error && <div className="error">Hmm, couldn't load this group: {error}</div>}
          {!error && items === null && <div className="loading">Catching up on the feed…</div>}

          {posts && (
            <CollapsibleSection title="Recap, leaderboard & more" open={extrasOpen} onToggle={toggleExtras}>
              {posts.length > 0 && (
                <>
                  <GroupRecapCard posts={posts} memberNames={memberNames} />
                  <GroupCoachTake posts={posts} memberNames={memberNames} />
                  <Leaderboard
                    posts={posts}
                    memberNames={memberNames}
                    currentUserId={user.id}
                    closes={closes}
                    groupId={id}
                    referralCounts={referralCounts}
                  />
                  <PickemLeaderboard posts={posts} memberNames={memberNames} />
                </>
              )}
              {/* Unlike the four above, a tournament doesn't need any bets
                  posted yet to start - it scores whatever comes in during its
                  own window - so this stays reachable even for a brand new,
                  still-empty group (matches its original, looser gate). */}
              <GroupTournamentSection
                groupId={id}
                groupName={group?.name ?? 'the group'}
                posts={posts}
                memberNames={memberNames}
                currentUserId={user.id}
                isCreator={isCreator}
              />
            </CollapsibleSection>
          )}

          {items && !items.length && (
            <GroupColdStart
              group={group}
              memberCount={members.length}
              onInvite={handleShareInvite}
              shareStatus={shareStatus}
            />
          )}

          {items && items.length > 0 && (
            <GroupConsensusCard picks={computeGroupConsensus(posts ?? [])} currentUserId={user.id} />
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
            <CoachGptLink />
          </div>
          {messages === null && <div className="loading">Catching up on the chat…</div>}
          {messages && !messages.length && (
            <EmptyState icon={<CommentIcon width={26} height={26} />} title="No messages yet" subtitle="Say something to get the chat going." />
          )}
          {messages && messages.length > 0 && (
            <div className="chat-messages">
              {messages.map((m) => {
                const mine = m.userId === user.id
                return (
                  <div key={m.id} className={mine ? 'chat-message chat-message-mine' : 'chat-message'}>
                    {!mine && <Avatar name={memberNames[m.userId] ?? 'Someone'} size={26} />}
                    <div className="chat-bubble">
                      {!mine && (
                        <div className="chat-author">
                          <UserLink id={m.userId} displayName={memberNames[m.userId] ?? 'Someone'} />
                        </div>
                      )}
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
          <div className="manage-list">
            {members.map((m) => (
              <div key={m.id} className="manage-list-row">
                <span className="fixture-team">
                  <Avatar name={m.displayName} size={26} />
                  {m.id === user.id ? (
                    <span>
                      {m.displayName} (you)
                      <ReferralTierBadge count={m.referralCount} />
                    </span>
                  ) : (
                    <UserLink id={m.id} displayName={m.displayName}>
                      <span>
                        {m.displayName}
                        <ReferralTierBadge count={m.referralCount} />
                      </span>
                    </UserLink>
                  )}
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

      {tab === 'settings' && isCreator && (
        <div>
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

          <label className="filter-toggle">
            <input
              type="checkbox"
              checked={group?.isDiscoverable ?? false}
              onChange={handleToggleDiscoverable}
              disabled={savingDiscoverable}
            />
            <span>List this group publicly in Discover</span>
          </label>

          <div className="group-billing-panel">
            {group?.stripeConnectChargesEnabled && group?.priceAmount ? (
              <>
                <p className="hint">£{Number(group.priceAmount).toFixed(2)}/month</p>
                {subscribers !== null &&
                  (() => {
                    const { grossMrr, netMrr } = computeGroupEarnings(subscribers.length, group.priceAmount)
                    return (
                      <>
                        <h2 className="market-title">Earnings</h2>
                        <div className="stat-tiles">
                          <div className="stat-tile">
                            <div className="stat-tile-value">{subscribers.length}</div>
                            <div className="stat-tile-label">Paying members</div>
                          </div>
                          <div className="stat-tile">
                            <div className="stat-tile-value">£{grossMrr.toFixed(2)}</div>
                            <div className="stat-tile-label">Gross revenue</div>
                          </div>
                          <div className="stat-tile">
                            <div className="stat-tile-value">£{netMrr.toFixed(2)}</div>
                            <div className="stat-tile-label">Your est. earnings</div>
                          </div>
                        </div>
                        <p className="hint">After BetMates' 10% fee - excludes Stripe's own processing fee.</p>
                        {subscribers.length > 0 && (
                          <>
                            <div className="manage-list">
                              {subscribers.map((s) => (
                                <div key={s.id} className="manage-list-row">
                                  <span>{s.displayName}</span>
                                </div>
                              ))}
                            </div>
                            <button className="btn btn-ghost btn-small" onClick={handleExportSubscribers}>
                              Export as CSV
                            </button>
                          </>
                        )}
                      </>
                    )
                  })()}
              </>
            ) : (
              <button className="btn btn-secondary btn-small" onClick={() => setShowGoPro(true)}>
                Turn this into a paid group
              </button>
            )}
          </div>

          {showGoPro && (
            <GoProSheet
              group={group}
              user={user}
              onClose={() => setShowGoPro(false)}
              priceInput={priceInput}
              setPriceInput={setPriceInput}
              savingPrice={savingPrice}
              handleSavePrice={handleSavePrice}
              connecting={connecting}
              connectError={connectError}
              handleConnectPayouts={handleConnectPayouts}
            />
          )}
        </div>
      )}

      {tab === 'predictor' && <TablePredictorPanel groupId={id} userId={user.id} memberNames={memberNames} />}
    </PullToRefresh>
  )
}
