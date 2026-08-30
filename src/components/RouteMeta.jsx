import { Helmet } from 'react-helmet-async'
import { useLocation } from 'react-router-dom'

// Per-route <head>: a unique <title> and meta description for the current
// route, so the browser tab and (JS-executing) crawlers see the page, not one
// static "BetMates" everywhere. Centralised here rather than sprinkled through
// ~25 page components: one table, one <Helmet>, trivially extendable.
//
// NOTE on canonical: the app uses HashRouter (URLs are /#/odds), and search
// engines do not treat hash fragments as separate URLs - so a per-route
// canonical would point at a path (/odds) that isn't the real address (/#/odds)
// and would be misleading. The single static canonical in index.html (the site
// root) is therefore left as the honest canonical. Real per-URL canonicals +
// the associated SEO win need migrating HashRouter -> BrowserRouter (with SPA
// redirects), which is a separate, deliberate decision - see the PR.

const DESC = 'Compare odds and settle scores with your mates - leaderboards, streaks, and shared bet slips.'

// Exact-path titles/descriptions. Titles carry the " · BetMates" suffix; the
// value here is just the page name.
const META = {
  '/dashboard': { t: 'Home', d: 'Your BetMates home - latest from your groups, live odds, and where you sit on the leaderboard.' },
  '/odds': { t: 'Odds', d: 'Compare the best odds across bookmakers for football, racing, UFC and more.' },
  '/groups': { t: 'Mates', d: 'Your betting groups - shared slips, banter, and the group leaderboard.' },
  '/groups/discover': { t: 'Discover groups', d: 'Find and join public BetMates groups.' },
  '/friends': { t: 'Friends', d: 'Add mates by code and follow their bets.' },
  '/tracker': { t: 'Tracker', d: 'Track your bets, P&L, streaks and CLV in one place.' },
  '/achievements': { t: 'Achievements', d: 'Badges, milestones and streaks you have unlocked on BetMates.' },
  '/insights': { t: 'Insights', d: 'Your betting patterns, discipline and value stats.' },
  '/coach': { t: 'CoachGPT', d: 'CoachGPT - AI punditry and value picks, trust-based and self-logged.' },
  '/explore': { t: 'Explore', d: 'See what your mates and the wider BetMates feed are backing.' },
  '/messages': { t: 'Messages', d: 'Your BetMates direct messages.' },
  '/alerts': { t: 'Notifications', d: 'Kickoff reminders, results and alerts you follow.' },
  '/account': { t: 'Account', d: 'Manage your BetMates profile, BetMates Plus and preferences.' },
  '/hall-of-fame': { t: 'Hall of Fame', d: 'The all-time BetMates leaderboard legends.' },
  '/help': { t: 'Help', d: 'How BetMates works - it tracks self-logged bets, it never places them.' },
  '/legal': { t: 'Legal', d: 'BetMates terms, privacy and responsible-gambling information.' }
}

// Prefix fallbacks for dynamic routes (e.g. /odds/football/:id, /groups/:id).
const PREFIX = [
  ['/odds/', { t: 'Odds', d: 'Live odds and markets for this event across bookmakers.' }],
  ['/groups/', { t: 'Group', d: 'A BetMates group - shared bet slips and the group leaderboard.' }],
  ['/messages/', { t: 'Messages', d: 'Your BetMates direct messages.' }],
  ['/u/', { t: 'Profile', d: 'A BetMates member profile - their record and badges.' }],
  ['/user/', { t: 'Profile', d: 'A BetMates member profile - their record and badges.' }],
  ['/join/', { t: 'Join a group', d: 'Join a BetMates group you were invited to.' }],
  ['/challenge/', { t: 'Challenge', d: 'A head-to-head BetMates challenge.' }],
  ['/admin', { t: 'Admin', d: 'BetMates admin.' }]
]

function metaFor(pathname) {
  if (META[pathname]) return META[pathname]
  const hit = PREFIX.find(([p]) => pathname.startsWith(p))
  if (hit) return hit[1]
  return null // fall back to index.html's static title/description
}

export default function RouteMeta() {
  const { pathname } = useLocation()
  const m = metaFor(pathname)
  if (!m) return null
  const title = `${m.t} · BetMates`
  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={m.d || DESC} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={m.d || DESC} />
    </Helmet>
  )
}
