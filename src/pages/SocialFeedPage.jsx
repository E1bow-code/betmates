import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useActivity } from '../context/ActivityContext.jsx'
import * as dataStore from '../lib/dataStore.js'
import { fetchSportsNews } from '../api/newsClient.js'
import { computeStats } from '../utils/trackerStats.js'
import { formatRelativeTime } from '../utils/format.js'
import { LEADERBOARD_WINDOWS, isWithinWindow } from '../utils/dateWindows.js'
import BetCard from '../components/BetCard.jsx'
import VideoCard from '../components/VideoCard.jsx'
import VideoRecorder from '../components/VideoRecorder.jsx'
import ManageSheet from '../components/ManageSheet.jsx'
import HeadToHeadSheet from '../components/HeadToHeadSheet.jsx'
import GroupVsGroupSheet from '../components/GroupVsGroupSheet.jsx'
import EmptyState from '../components/EmptyState.jsx'
import Avatar from '../components/Avatar.jsx'
import PullToRefresh from '../components/PullToRefresh.jsx'
import ShareLeaderboardButton from '../components/ShareLeaderboardButton.jsx'
import SportHeroBanner from '../components/SportHeroBanner.jsx'
import FplPanel from '../components/FplPanel.jsx'
import SportIcon from '../components/icons/SportIcons.jsx'
import { computeTrendingPicks } from '../utils/trending.js'
import { computeTipsterRankings } from '../utils/tipsters.js'
import TipsterLeaderboard from '../components/TipsterLeaderboard.jsx'
import BookmakerScoreboard from '../components/BookmakerScoreboard.jsx'
import { computeBookmakerScoreboard } from '../utils/bookmakerScoreboard.js'

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
  const location = useLocation()
  const [segment, setSegment] = useState(location.state?.segment ?? 'bets')
  const [groups, setGroups] = useState(null)
  const [feed, setFeed] = useState(null)
  const [friends, setFriends] = useState(null)
  const [videos, setVideos] = useState(null)
  const [publicFeed, setPublicFeed] = useState(null)
  const [news, setNews] = useState(null)
  const [followedParticipants, setFollowedParticipants] = useState(null)
  const [newsFilter, setNewsFilter] = useState('all')
  const [showManage, setShowManage] = useState(false)
  const [showRecorder, setShowRecorder] = useState(false)
  const [compareFriend, setCompareFriend] = useState(null)
  const [showGroupCompare, setShowGroupCompare] = useState(false)
  const [leaderboardWindow, setLeaderboardWindow] = useState('all')

  useEffect(() => {
    refreshBets()
    markSeen()
  }, [])

  useEffect(() => {
    if (segment === 'tips' && videos === null) refreshTips()
    if ((segment === 'feed' || segment === 'leaderboard' || segment === 'tipsters' || segment === 'bookmakers') && publicFeed === null)
      refreshPublicFeed()
    if (segment === 'news' && news === null) refreshNews()
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

  const trendingPicks = useMemo(() => (publicFeed ? computeTrendingPicks(publicFeed) : []), [publicFeed])

  const tipsterRankings = useMemo(() => computeTipsterRankings(publicFeed, leaderboardWindow), [publicFeed, leaderboardWindow])

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
    return Promise.all([
      dataStore.listFriends(user.id).then(setFriends),
      Promise.all([dataStore.listFriendsFeed(user.id), dataStore.listSharedWithMe(user.id)]).then(([own, shared]) => {
        const merged = new Map()
        for (const v of [...own, ...shared]) merged.set(`${v.id}-${v.sharedAt ?? 'own'}`, v)
        setVideos([...merged.values()].sort((a, b) => new Date(b.sharedAt ?? b.createdAt) - new Date(a.sharedAt ?? a.createdAt)))
      })
    ])
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

  function handleBlocked(blockedUserId) {
    setPublicFeed((pf) => (pf ? pf.filter((p) => p.userId !== blockedUserId) : pf))
  }

  function handleManageChanged() {
    refreshBets()
    refreshTips()
  }

  function refreshCurrentSegment() {
    if (segment === 'bets') return refreshBets()
    if (segment === 'tips') return refreshTips()
    if (segment === 'fpl') return Promise.resolve()
    if (segment === 'news') return refreshNews()
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
              💬
              {hasUnseenMessages && <span className="pill-dot" />}
            </Link>
            {segment !== 'feed' && segment !== 'fpl' && (
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
          <button className={segment === 'leaderboard' ? 'sport-pill active' : 'sport-pill'} onClick={() => setSegment('leaderboard')}>
            🏆 Leaderboard
          </button>
          <button className={segment === 'tipsters' ? 'sport-pill active' : 'sport-pill'} onClick={() => setSegment('tipsters')}>
            🎯 Tipsters
          </button>
          <button className={segment === 'bookmakers' ? 'sport-pill active' : 'sport-pill'} onClick={() => setSegment('bookmakers')}>
            🏦 Bookmakers
          </button>
          <button className={segment === 'feed' ? 'sport-pill active' : 'sport-pill'} onClick={() => setSegment('feed')}>
            Feed
          </button>
          <button className={segment === 'news' ? 'sport-pill active' : 'sport-pill'} onClick={() => setSegment('news')}>
            📰 News
          </button>
          <button className={segment === 'tips' ? 'sport-pill active' : 'sport-pill'} onClick={() => setSegment('tips')}>
            Tips
          </button>
          <button className={segment === 'fpl' ? 'sport-pill active' : 'sport-pill'} onClick={() => setSegment('fpl')}>
            FPL
          </button>
        </div>
      </div>

      {segment === 'bets' && (
        <>
          {groups === null && <div className="loading">Loading your groups…</div>}

          {groups && !groups.length && (
            <EmptyState
              icon="👥"
              title="No groups yet"
              subtitle="Create one for your mates, or join with an invite code, to start sharing bets."
              action={
                <button className="btn btn-primary" onClick={() => setShowManage(true)}>
                  Create or join a group
                </button>
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
              <button className="btn btn-ghost btn-small" onClick={() => setShowGroupCompare(true)}>
                ⚔️ Compare groups
              </button>
            </div>
          )}

          {feed === null && groups?.length > 0 && <div className="loading">Catching up on the latest bets…</div>}
          {feed && groups?.length > 0 && !feed.length && (
            <EmptyState icon="🔕" title="Quiet in here so far" subtitle="Head to the Odds tab and tap a price to get the first bet posted." />
          )}

          {feed && feed.length > 0 && (
            <div className="bet-feed">
              {feed.map((post) => (
                <BetCard key={post.id} post={post} memberNames={post.memberNames} onChanged={refreshBets} />
              ))}
            </div>
          )}
        </>
      )}

      {segment === 'feed' && (
        <>
          <p className="hint">Everyone's picks - tap a price on the Odds tab and choose "Post to everyone" to add yours.</p>

          {trendingPicks.length > 0 && (
            <div className="account-section">
              <h2 className="market-title">🔥 Trending this week</h2>
              <div className="trending-row">
                {trendingPicks.map((pick, i) => (
                  <div key={pick.key} className="trending-chip">
                    <span className="trending-chip-rank">{i + 1}</span>
                    <SportIcon sport={pick.sport} size={18} />
                    <div>
                      <div className="trending-chip-pick">{pick.selection}</div>
                      <div className="trending-chip-meta">
                        {pick.event} · {pick.count} backing this
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {publicFeed === null && <div className="loading">Catching up on the feed…</div>}
          {publicFeed && !publicFeed.length && (
            <EmptyState icon="📣" title="Nothing here yet" subtitle="Be the first to post a pick for everyone to see." />
          )}

          {publicFeed && publicFeed.length > 0 && (
            <div className="bet-feed">
              {publicFeed.map((post) => (
                <BetCard key={post.id} post={post} variant="public" onBlocked={handleBlocked} onChanged={refreshPublicFeed} />
              ))}
            </div>
          )}
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
            <EmptyState icon="📰" title="No headlines right now" subtitle="The feeds didn't return anything - try again shortly." />
          )}
          {news && news.length > 0 && filteredNews && !filteredNews.length && (
            <EmptyState
              icon="📰"
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
              icon="🎥"
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
              icon="🏆"
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
