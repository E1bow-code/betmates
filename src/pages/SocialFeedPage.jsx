import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useActivity } from '../context/ActivityContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import * as dataStore from '../lib/dataStore.js'
import { fetchSportsNews } from '../api/newsClient.js'
import { computeStats } from '../utils/trackerStats.js'
import { tipsterBadge } from '../utils/tipsterBadge.js'
import { formatRelativeTime } from '../utils/format.js'
import { LEADERBOARD_WINDOWS, isWithinWindow } from '../utils/dateWindows.js'
import BetCard from '../components/BetCard.jsx'
import PublicFeedView from '../components/PublicFeedView.jsx'
import VideoCard from '../components/VideoCard.jsx'
import VideoRecorder from '../components/VideoRecorder.jsx'
import ManageSheet from '../components/ManageSheet.jsx'
import HeadToHeadSheet from '../components/HeadToHeadSheet.jsx'
import GroupVsGroupSheet from '../components/GroupVsGroupSheet.jsx'
import EmptyState from '../components/EmptyState.jsx'
import InviteMatesButton from '../components/InviteMatesButton.jsx'
import Avatar from '../components/Avatar.jsx'
import PullToRefresh from '../components/PullToRefresh.jsx'
import ShareLeaderboardButton from '../components/ShareLeaderboardButton.jsx'
import SportHeroBanner from '../components/SportHeroBanner.jsx'
import FplPanel from '../components/FplPanel.jsx'
import {
  CommentIcon,
  SearchIcon,
  TrophyIcon,
  TargetIcon,
  BankIcon,
  NewsIcon,
  PeopleIcon,
  SwordsIcon,
  BellOffIcon,
  VideoIcon,
  BadgeCheckIcon
} from '../components/icons/Icons.jsx'
import { computeTipsterRankings } from '../utils/tipsters.js'
import TipsterLeaderboard from '../components/TipsterLeaderboard.jsx'
import BookmakerScoreboard from '../components/BookmakerScoreboard.jsx'
import { computeBookmakerScoreboard } from '../utils/bookmakerScoreboard.js'

const TIPSTER_BADGE_ICON = { sharp: TargetIcon, reliable: BadgeCheckIcon }

// Landing view for the Social tab. The feed is the main attraction - group/
// friend management (create, join, invite codes) lives behind the Manage
// sheet instead of sitting above the feed. Segments:
// - Bets: one merged timeline across every group the user is in.
// - Leaderboard: unlike components/Leaderboard.jsx (scoped to one group's
//   posts, embedded in GroupFeedPage), this ranks everyone the user can
//   see a settled bet from at all - their own groups' posts plus the
//   public feed - since "who's actually good at this" is more interesting
//   across everything than locked to a single group.
// - Feed: public timeline, anyone's posts, regardless of group membership -
//   confidence votes + follow instead of group-mate reactions (BetCard's
//   variant="public").
// - News: real sport headlines (netlify/functions/sports-news.js's BBC
//   Sport/Sky Sports RSS feeds, the same source NewsTickerBar/NewsSidebar
//   already scroll elsewhere in the app) as an actual browsable list
//   instead of another auto-scrolling ticker - team news, injuries, price
//   moves, the stuff a punter actually wants to see, not just bet activity.
//   "My teams" filters those headlines against followed_participants (see
//   dataStore.followParticipant/OddsListPage's "My teams only" filter) by
//   plain substring match on the title - there's no team/sport tag on an
//   RSS item to join against, so this is deliberately fuzzy rather than an
//   exact ID match. The toggle only appears once the user follows anyone,
//   so it doesn't show a dead control to someone who's followed nothing.
// - Tips: a Twitter-style feed of talking-to-camera picks from the user
//   and their friends (see src/components/VideoRecorder.jsx), with a way
//   to forward a good one into a group or straight to a friend.
// - Bookmakers: same visible-to-you data as Leaderboard, regrouped by
//   bookmaker instead of by person (src/utils/bookmakerScoreboard.js) -
//   which bookmaker has actually paid out best, not just who's good at
//   picking. Nothing else surfaces this: a real bookmaker won't rank
//   itself against competitors, and a pure EV tracker ranks bettors, not
//   books.

export default function SocialFeedPage() {
  const { user } = useAuth()
  const { markSeen, hasUnseenMessages } = useActivity()
  const { showToast } = useToast()
  const location = useLocation()
  const navigate = useNavigate()
  const [segment, setSegment] = useState(location.state?.segment ?? 'bets')
  const [groups, setGroups] = useState(null)
  const [discoverGroups, setDiscoverGroups] = useState(null)
  // Tipster badge per priced Discover row, keyed by group id (not owner id -
  // two priced groups could share an owner). Free groups never get an entry.
  const [ownerBadges, setOwnerBadges] = useState({})
  const [discoverSearch, setDiscoverSearch] = useState('')
  const [joiningId, setJoiningId] = useState(null)
  const [feed, setFeed] = useState(null)
  const [friends, setFriends] = useState(null)
  const [videos, setVideos] = useState(null)
  const [publicFeed, setPublicFeed] = useState(null)
  // Closing lines for the fixtures the public feed touches, keyed
  // {eventId|marketKey|outcomeName} (see dataStore.getClosingLines). Feeds the
  // tipster board's CLV stat; empty until snapshots exist, in which case CLV
  // simply doesn't show.
  const [closes, setCloses] = useState({})
  const [news, setNews] = useState(null)
  const [followedParticipants, setFollowedParticipants] = useState(null)
  const [newsFilter, setNewsFilter] = useState('all')
  const [showManage, setShowManage] = useState(false)
  const [showRecorder, setShowRecorder] = useState(false)
  const [compareFriend, setCompareFriend] = useState(null)
  const [showGroupCompare, setShowGroupCompare] = useState(false)
  const [leaderboardWindow, setLeaderboardWindow] = useState('all')
  const [moreSegmentsOpen, setMoreSegmentsOpen] = useState(false)
  const publicFeedViewRef = useRef(null)

  // A brand-new, groupless account landing here has nothing to anchor
  // Leaderboard/Tipsters/Bookmakers/News/Tips/FPL against yet, so those
  // stay behind "More tabs" until there's at least one group - or the
  // user's already been deep-linked into one of them (e.g. the "← Friends"/
  // "← Social" back-links from Messages, which land on segment: 'tips').
  // Home's own feed interleaves tips directly (see PublicFeedView.jsx) so
  // it no longer links in here for browsing - this segment's still where
  // recording/friend-compare for Tips lives when reached some other way.
  // Deliberately not labelled just "More" - that's MoreMenu.jsx's name for
  // the unrelated app-wide nav drawer, and this page already renders both
  // on screen at once.
  const EXTRA_SEGMENTS = ['leaderboard', 'tipsters', 'bookmakers', 'news', 'tips', 'fpl']
  const showAllSegments = moreSegmentsOpen || (groups && groups.length > 0) || EXTRA_SEGMENTS.includes(segment)

  useEffect(() => {
    refreshBets()
    markSeen()
  }, [])

  useEffect(() => {
    if (segment === 'tips' && videos === null) refreshTips()
    if ((segment === 'leaderboard' || segment === 'tipsters' || segment === 'bookmakers') && publicFeed === null) refreshPublicFeed()
    if (segment === 'news' && news === null) refreshNews()
    if (segment === 'discover' && discoverGroups === null) refreshDiscover()
  }, [segment])

  const leaderboardRows = useMemo(() => {
    if (feed === null || publicFeed === null) return null
    const names = new Map()
    const byUser = new Map()
    for (const post of [...feed, ...publicFeed]) {
      if (post.stakeHidden) continue
      if (post.settledAt && !isWithinWindow(post.settledAt, leaderboardWindow)) continue
      const name = post.memberNames?.[post.userId] ?? post.authorName ?? 'Someone'
      if (!names.has(post.userId)) names.set(post.userId, name)
      if (!byUser.has(post.userId)) byUser.set(post.userId, [])
      byUser.get(post.userId).push(post)
    }
    return [...byUser.entries()]
      .map(([userId, posts]) => ({ userId, name: names.get(userId), ...computeStats(posts) }))
      .filter((row) => row.settledCount > 0)
      .sort((a, b) => b.profit - a.profit)
  }, [feed, publicFeed, leaderboardWindow])

  // Once the public feed loads, pull the closing lines for every fixture its
  // posts reference so the tipster board can show each tipster's CLV.
  // Best-effort - a failure just leaves CLV absent (the board still ranks by ROI).
  useEffect(() => {
    if (!publicFeed) return
    const fixtureIds = publicFeed.flatMap((post) => (post.selections ?? []).map((s) => s.eventId)).filter(Boolean)
    dataStore.getClosingLines(fixtureIds).then(setCloses).catch(() => {})
  }, [publicFeed])

  const tipsterRankings = useMemo(
    () => computeTipsterRankings(publicFeed, leaderboardWindow, closes),
    [publicFeed, leaderboardWindow, closes]
  )

  const bookmakerRows = useMemo(() => {
    if (feed === null || publicFeed === null) return null
    return computeBookmakerScoreboard([...feed, ...publicFeed])
  }, [feed, publicFeed])

  const filteredNews = useMemo(() => {
    if (!news || newsFilter !== 'mine' || !followedParticipants?.length) return news
    const names = followedParticipants.map((p) => p.name.toLowerCase())
    return news.filter((item) => names.some((name) => item.title.toLowerCase().includes(name)))
  }, [news, newsFilter, followedParticipants])

  function refreshBets() {
    return Promise.all([dataStore.listMyGroups(user.id).then(setGroups), dataStore.listFeedForUser(user.id).then(setFeed)])
  }

  function refreshTips() {
    return Promise.all([dataStore.listFriends(user.id).then(setFriends), dataStore.listTipsFeed(user.id).then(setVideos)])
  }

  function refreshPublicFeed() {
    return dataStore.listPublicFeed(user.id).then(setPublicFeed)
  }

  function refreshNews() {
    return Promise.all([
      fetchSportsNews()
        .then(setNews)
        .catch(() => setNews([])),
      dataStore
        .listFollowedParticipants(user.id)
        .then(setFollowedParticipants)
        .catch(() => setFollowedParticipants([]))
    ])
  }

  function handleManageChanged() {
    refreshBets()
    refreshTips()
  }

  function refreshDiscover() {
    return dataStore.listDiscoverableGroups(user.id).then((groups) => {
      setDiscoverGroups(groups)
      const priced = groups.filter((g) => g.priceAmount)
      if (!priced.length) return
      // Same fetch -> filter-to-public -> computeStats -> tipsterBadge pattern
      // BetBuilderSheet's notifyPublicFollowers() uses to badge a push
      // notification, applied here to a group owner instead of the poster -
      // re-filtered client-side rather than trusting RLS alone, so a badge
      // never reflects group-private picks.
      Promise.all(
        priced.map((g) =>
          dataStore.listBetPostsByUser(g.createdBy).then((posts) => {
            const stats = computeStats(posts.filter((p) => p.visibility === 'public' && !p.stakeHidden))
            return [g.id, tipsterBadge(stats)]
          })
        )
      ).then((entries) => setOwnerBadges(Object.fromEntries(entries.filter(([, badge]) => badge))))
    })
  }

  async function handleJoinDiscoverable(group) {
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

  function refreshCurrentSegment() {
    if (segment === 'bets') return refreshBets()
    if (segment === 'tips') return refreshTips()
    if (segment === 'fpl') return Promise.resolve()
    if (segment === 'news') return refreshNews()
    if (segment === 'feed') return publicFeedViewRef.current?.refresh() ?? Promise.resolve()
    if (segment === 'discover') return refreshDiscover()
    return refreshPublicFeed()
  }

  return (
    <PullToRefresh onRefresh={refreshCurrentSegment}>
      <SportHeroBanner sport="social" />
      <div className="topbar">
        <div className="topbar-row">
          <h1>Social</h1>
          <div className="topbar-actions">
            <Link className="icon-btn" to="/messages" aria-label={`Messages${hasUnseenMessages ? ' - unread' : ''}`}>
              <CommentIcon width={16} height={16} />
              {hasUnseenMessages && <span className="pill-dot" />}
            </Link>
            {segment !== 'feed' && segment !== 'fpl' && segment !== 'discover' && (
              <button className="btn btn-ghost btn-small" onClick={() => setShowManage(true)}>
                {segment === 'bets' ? 'Groups' : 'Friends'}
              </button>
            )}
          </div>
        </div>
        <div className="sport-switcher">
          <button className={segment === 'bets' ? 'sport-pill active' : 'sport-pill'} onClick={() => setSegment('bets')}>
            Bets
          </button>
          <button className={segment === 'feed' ? 'sport-pill active' : 'sport-pill'} onClick={() => setSegment('feed')}>
            Feed
          </button>
          <button
            className={segment === 'discover' ? 'sport-pill active icon-row' : 'sport-pill icon-row'}
            onClick={() => setSegment('discover')}
          >
            <SearchIcon width={14} height={14} /> Discover
          </button>
          {showAllSegments ? (
            <>
              <button
                className={segment === 'leaderboard' ? 'sport-pill active icon-row' : 'sport-pill icon-row'}
                onClick={() => setSegment('leaderboard')}
              >
                <TrophyIcon width={14} height={14} /> Leaderboard
              </button>
              <button
                className={segment === 'tipsters' ? 'sport-pill active icon-row' : 'sport-pill icon-row'}
                onClick={() => setSegment('tipsters')}
              >
                <TargetIcon width={14} height={14} /> Tipsters
              </button>
              <button
                className={segment === 'bookmakers' ? 'sport-pill active icon-row' : 'sport-pill icon-row'}
                onClick={() => setSegment('bookmakers')}
              >
                <BankIcon width={14} height={14} /> Bookmakers
              </button>
              <button
                className={segment === 'news' ? 'sport-pill active icon-row' : 'sport-pill icon-row'}
                onClick={() => setSegment('news')}
              >
                <NewsIcon width={14} height={14} /> News
              </button>
              <button className={segment === 'tips' ? 'sport-pill active' : 'sport-pill'} onClick={() => setSegment('tips')}>
                Tips
              </button>
              <button className={segment === 'fpl' ? 'sport-pill active' : 'sport-pill'} onClick={() => setSegment('fpl')}>
                FPL
              </button>
            </>
          ) : (
            <button className="sport-pill" onClick={() => setMoreSegmentsOpen(true)}>
              More tabs ▾
            </button>
          )}
        </div>
      </div>

      {segment === 'bets' && (
        <>
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
                <Link key={g.id} to={`/groups/${g.id}`} className="group-chip">
                  {g.name}
                </Link>
              ))}
            </div>
          )}

          {groups && groups.length > 1 && (
            <div className="group-actions">
              <button className="btn btn-ghost btn-small icon-row" onClick={() => setShowGroupCompare(true)}>
                <SwordsIcon width={15} height={15} /> Compare groups
              </button>
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
                <BetCard key={post.id} post={post} memberNames={post.memberNames} memberAvatars={post.memberAvatars} onChanged={refreshBets} />
              ))}
            </div>
          )}
        </>
      )}

      {segment === 'feed' && <PublicFeedView ref={publicFeedViewRef} />}

      {segment === 'discover' && (
        <>
          <p className="hint">Find a public group to join - no invite code needed.</p>
          <input
            className="search-input"
            type="search"
            placeholder="Search groups by name…"
            value={discoverSearch}
            onChange={(e) => setDiscoverSearch(e.target.value)}
          />

          {discoverGroups === null && <div className="loading">Finding public groups…</div>}

          {discoverGroups && !discoverGroups.length && (
            <EmptyState
              icon={<SearchIcon width={26} height={26} />}
              title="No public groups yet"
              subtitle="Nobody's made a group discoverable yet - check back later, or start your own."
            />
          )}

          {discoverGroups && discoverGroups.length > 0 && (() => {
            const q = discoverSearch.trim().toLowerCase()
            const filtered = q ? discoverGroups.filter((g) => g.name.toLowerCase().includes(q)) : discoverGroups
            if (!filtered.length) {
              return <EmptyState icon={<SearchIcon width={26} height={26} />} title="No matches" subtitle={`Nothing found for "${discoverSearch.trim()}".`} />
            }
            return (
              <div className="discover-group-list">
                {filtered.map((g) => (
                  <div key={g.id} className="discover-group-row">
                    <div className="discover-group-row-main">
                      <div className="discover-group-row-name">
                        {g.name}
                        {g.priceAmount && <span className="discover-group-price-badge">£{Number(g.priceAmount).toFixed(2)}/mo</span>}
                        {ownerBadges[g.id] &&
                          (() => {
                            const BadgeIcon = TIPSTER_BADGE_ICON[ownerBadges[g.id].icon]
                            return (
                              <span className="discover-group-tipster-badge icon-row">
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
                      <button
                        className="btn btn-primary btn-small"
                        onClick={() => handleJoinDiscoverable(g)}
                        disabled={joiningId === g.id}
                      >
                        {joiningId === g.id ? 'Joining…' : 'Join'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )
          })()}
        </>
      )}

      {segment === 'news' && (
        <>
          <p className="hint">Sport headlines worth knowing before you bet - team news, injuries, price moves.</p>

          {followedParticipants && followedParticipants.length > 0 && (
            <div className="mode-switcher">
              <button className={newsFilter === 'all' ? 'mode-tab active' : 'mode-tab'} onClick={() => setNewsFilter('all')}>
                All
              </button>
              <button className={newsFilter === 'mine' ? 'mode-tab active' : 'mode-tab'} onClick={() => setNewsFilter('mine')}>
                My teams
              </button>
            </div>
          )}

          {news === null && <div className="loading">Catching up on the headlines…</div>}
          {news && !news.length && (
            <EmptyState icon={<NewsIcon width={26} height={26} />} title="No headlines right now" subtitle="The feeds didn't return anything - try again shortly." />
          )}
          {news && news.length > 0 && filteredNews && !filteredNews.length && (
            <EmptyState
              icon={<NewsIcon width={26} height={26} />}
              title="Nothing about your teams right now"
              subtitle="None of the latest headlines mention a team or player you follow - switch to All to see everything."
            />
          )}

          {filteredNews && filteredNews.length > 0 && (
            <div className="news-feed-list">
              {filteredNews.map((item, i) => (
                <a key={i} className="news-feed-item" href={item.link} target="_blank" rel="noreferrer">
                  <div className="news-feed-item-top">
                    <span className="news-feed-source">{item.source}</span>
                    {item.pubDate && <span className="news-feed-time">{formatRelativeTime(item.pubDate)}</span>}
                  </div>
                  <div className="news-feed-title">{item.title}</div>
                </a>
              ))}
            </div>
          )}
        </>
      )}

      {segment === 'tips' && (
        <>
          {friends && friends.length > 0 && (
            <div className="group-chip-row">
              {friends.map((f) => (
                <button key={f.id} className="group-chip friend-chip friend-chip-btn" onClick={() => setCompareFriend(f)}>
                  {f.displayName} <span className="friend-chip-vs">vs</span>
                </button>
              ))}
            </div>
          )}

          <div className="group-actions">
            <button className="btn btn-primary btn-small" onClick={() => setShowRecorder(true)}>
              New tip
            </button>
          </div>

          {videos === null && <div className="loading">Loading tips…</div>}
          {videos && !videos.length && (
            <EmptyState
              icon={<VideoIcon width={26} height={26} />}
              title="No tips yet"
              subtitle="Add a friend with their code, or record the first one yourself."
              action={
                <button className="btn btn-secondary" onClick={() => setShowManage(true)}>
                  Add a friend
                </button>
              }
            />
          )}

          {videos && videos.length > 0 && (
            <div className="bet-feed">
              {videos.map((v) => (
                <VideoCard key={`${v.id}-${v.sharedAt ?? 'own'}`} post={v} />
              ))}
            </div>
          )}
        </>
      )}

      {segment === 'tipsters' && (
        <TipsterLeaderboard
          rows={tipsterRankings}
          window={leaderboardWindow}
          onWindowChange={setLeaderboardWindow}
          currentUserId={user.id}
        />
      )}

      {segment === 'bookmakers' && <BookmakerScoreboard rows={bookmakerRows} />}

      {segment === 'leaderboard' && (
        <>
          <p className="hint">
            Ranked by profit across every group you're in, plus the public feed - hidden-stake bets don't count.{' '}
            <Link to="/hall-of-fame">See the all-time Hall of Fame →</Link>
          </p>

          <div className="mode-switcher">
            {LEADERBOARD_WINDOWS.map((w) => (
              <button
                key={w.key}
                className={leaderboardWindow === w.key ? 'mode-tab active' : 'mode-tab'}
                onClick={() => setLeaderboardWindow(w.key)}
              >
                {w.label}
              </button>
            ))}
          </div>

          {leaderboardRows === null && <div className="loading">Adding it all up…</div>}
          {leaderboardRows && !leaderboardRows.length && (
            <EmptyState
              icon={<TrophyIcon width={26} height={26} />}
              title="Nothing settled yet"
              subtitle={
                leaderboardWindow === 'all'
                  ? 'Once bets start getting marked won or lost, the table fills in here.'
                  : 'Nothing settled in this window - try All-time.'
              }
            />
          )}

          {leaderboardRows && leaderboardRows.length > 0 && (
            <div className="leaderboard-list leaderboard-list-standalone">
              {leaderboardRows.map((row, i) => (
                <div key={row.userId} className={i === 0 ? 'leaderboard-row leaderboard-row-top' : 'leaderboard-row'}>
                  <span className="leaderboard-rank">#{i + 1}</span>
                  <Avatar name={row.name} size={24} />
                  <span className="leaderboard-name">{row.name}</span>
                  <span className={`leaderboard-pnl ${row.profit >= 0 ? 'tone-good' : 'tone-bad'}`}>
                    {row.profit >= 0 ? '+' : ''}£{row.profit.toFixed(2)}
                  </span>
                  <span className="leaderboard-meta">
                    {row.winRate === null ? '-' : `${row.winRate}% WR`} · {row.roi === null ? '-' : `${row.roi >= 0 ? '+' : ''}${row.roi}% ROI`}
                  </span>
                  {row.userId === user.id && (
                    <ShareLeaderboardButton
                      name={row.name}
                      rank={i + 1}
                      profit={row.profit}
                      winRate={row.winRate}
                      roi={row.roi}
                      windowLabel={LEADERBOARD_WINDOWS.find((w) => w.key === leaderboardWindow)?.label ?? 'All-time'}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {segment === 'fpl' && <FplPanel />}

      {showManage && (
        <ManageSheet
          segment={segment}
          groups={groups}
          friends={friends}
          onChanged={handleManageChanged}
          onClose={() => setShowManage(false)}
        />
      )}

      {showRecorder && <VideoRecorder onClose={() => setShowRecorder(false)} onPosted={refreshTips} />}
      {compareFriend && <HeadToHeadSheet friend={compareFriend} onClose={() => setCompareFriend(null)} />}
      {showGroupCompare && groups?.length > 1 && (
        <GroupVsGroupSheet groups={groups} onClose={() => setShowGroupCompare(false)} />
      )}
    </PullToRefresh>
  )
}
