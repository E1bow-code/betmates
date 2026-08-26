import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import * as dataStore from '../lib/dataStore.js'
import { fetchSportsNews } from '../api/newsClient.js'
import { computeStats } from '../utils/trackerStats.js'
import { formatRelativeTime } from '../utils/format.js'
import { LEADERBOARD_WINDOWS, isWithinWindow } from '../utils/dateWindows.js'
import { computeTipsterRankings } from '../utils/tipsters.js'
import { computeBookmakerScoreboard } from '../utils/bookmakerScoreboard.js'
import { computeTrendingPicks } from '../utils/trending.js'
import TipsterLeaderboard from '../components/TipsterLeaderboard.jsx'
import BookmakerScoreboard from '../components/BookmakerScoreboard.jsx'
import FplPanel from '../components/FplPanel.jsx'
import EmptyState from '../components/EmptyState.jsx'
import Avatar from '../components/Avatar.jsx'
import PullToRefresh from '../components/PullToRefresh.jsx'
import ShareLeaderboardButton from '../components/ShareLeaderboardButton.jsx'
import SportHeroBanner from '../components/SportHeroBanner.jsx'
import SportIcon from '../components/icons/SportIcons.jsx'
import { TrophyIcon, TargetIcon, BankIcon, NewsIcon, FlameIcon } from '../components/icons/Icons.jsx'

const CHIP_PILL = 'chip chip--pill chip--md chip--outline'
const CHIP_PILL_ACTIVE = 'chip chip--pill chip--md chip--solid-accent'

// Global rankings and content that aren't about your specific groups or
// friends - Leaderboard/Tipsters/Bookmakers/News/Fantasy used to be tabs
// crammed onto the Mates page (src/pages/SocialFeedPage.jsx) alongside real
// group/friend content; they've moved here so Mates (now split into
// GroupsHomePage.jsx/FriendsPage.jsx) stays about your own social graph and
// this page stays about everyone/everything. Reached from MoreMenu.jsx, not
// BottomNav - like Discover/CoachGPT, it's one tap away rather than a
// primary tab.
//
// Leaderboard/Bookmakers unlike components/Leaderboard.jsx (scoped to one
// group's posts, embedded in GroupFeedPage) rank everyone the user can see a
// settled bet from at all - their own groups' posts plus the public feed -
// since "who's actually good at this" is more interesting across everything
// than locked to a single group.
export default function ExplorePage() {
  const { user } = useAuth()
  const [tab, setTab] = useState('leaderboard')
  const [feed, setFeed] = useState(null)
  const [publicFeed, setPublicFeed] = useState(null)
  // Closing lines for the fixtures the public feed touches, keyed
  // {eventId|marketKey|outcomeName} (see dataStore.getClosingLines). Feeds
  // the tipster board's CLV stat; empty until snapshots exist, in which case
  // CLV simply doesn't show.
  const [closes, setCloses] = useState({})
  const [news, setNews] = useState(null)
  const [followedParticipants, setFollowedParticipants] = useState(null)
  const [newsFilter, setNewsFilter] = useState('all')
  const [leaderboardWindow, setLeaderboardWindow] = useState('all')

  useEffect(() => {
    if ((tab === 'leaderboard' || tab === 'bookmakers') && feed === null) refreshOwnFeed()
    if ((tab === 'leaderboard' || tab === 'tipsters' || tab === 'bookmakers') && publicFeed === null) refreshPublicFeed()
    if (tab === 'news' && news === null) refreshNews()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

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

  const trendingPicks = useMemo(() => (publicFeed ? computeTrendingPicks(publicFeed) : []), [publicFeed])

  const filteredNews = useMemo(() => {
    if (!news || newsFilter !== 'mine' || !followedParticipants?.length) return news
    const names = followedParticipants.map((p) => p.name.toLowerCase())
    return news.filter((item) => names.some((name) => item.title.toLowerCase().includes(name)))
  }, [news, newsFilter, followedParticipants])

  function refreshOwnFeed() {
    return dataStore.listFeedForUser(user.id).then(setFeed)
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

  function refreshCurrentTab() {
    if (tab === 'fantasy') return Promise.resolve()
    if (tab === 'news') return refreshNews()
    if (tab === 'tipsters') return refreshPublicFeed()
    return Promise.all([refreshOwnFeed(), refreshPublicFeed()])
  }

  return (
    <PullToRefresh onRefresh={refreshCurrentTab}>
      <SportHeroBanner sport="explore" />
      <div className="topbar">
        <div className="topbar-row">
          <h1>Explore</h1>
        </div>
        <div className="sport-switcher">
          <button
            className={(tab === 'leaderboard' ? CHIP_PILL_ACTIVE + ' sport-pill active' : CHIP_PILL + ' sport-pill') + ' icon-row'}
            onClick={() => setTab('leaderboard')}
          >
            <TrophyIcon width={14} height={14} /> Leaderboard
          </button>
          <button
            className={(tab === 'tipsters' ? CHIP_PILL_ACTIVE + ' sport-pill active' : CHIP_PILL + ' sport-pill') + ' icon-row'}
            onClick={() => setTab('tipsters')}
          >
            <TargetIcon width={14} height={14} /> Tipsters
          </button>
          <button
            className={(tab === 'bookmakers' ? CHIP_PILL_ACTIVE + ' sport-pill active' : CHIP_PILL + ' sport-pill') + ' icon-row'}
            onClick={() => setTab('bookmakers')}
          >
            <BankIcon width={14} height={14} /> Bookmakers
          </button>
          <button
            className={(tab === 'news' ? CHIP_PILL_ACTIVE + ' sport-pill active' : CHIP_PILL + ' sport-pill') + ' icon-row'}
            onClick={() => setTab('news')}
          >
            <NewsIcon width={14} height={14} /> News
          </button>
          <button className={tab === 'fantasy' ? CHIP_PILL_ACTIVE + ' sport-pill active' : CHIP_PILL + ' sport-pill'} onClick={() => setTab('fantasy')}>
            Fantasy
          </button>
        </div>
      </div>

      {tab === 'leaderboard' && (
        <>
          {trendingPicks.length > 0 && (
            <div className="account-section">
              <h2 className="market-title">
                <span className="icon-row">
                  <FlameIcon /> Trending this week
                </span>
              </h2>
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

      {tab === 'tipsters' && (
        <TipsterLeaderboard rows={tipsterRankings} window={leaderboardWindow} onWindowChange={setLeaderboardWindow} currentUserId={user.id} />
      )}

      {tab === 'bookmakers' && <BookmakerScoreboard rows={bookmakerRows} />}

      {tab === 'news' && (
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

      {tab === 'fantasy' && <FplPanel />}
    </PullToRefresh>
  )
}
