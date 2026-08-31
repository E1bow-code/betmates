import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { analytics } from '../lib/analyticsClient.js'

// Keeps document.title in step with the current route so each screen has its
// own title in the browser tab, history, bookmarks and the PWA switcher -
// otherwise a single-page app shows the one static <title> everywhere. Mounted
// once in the Shell (App.jsx); matches the most specific prefix first so detail
// routes (/odds/football/:id) still resolve to a sensible section title.
const EXACT = {
  '/dashboard': 'Home',
  '/odds': 'Odds',
  '/groups': 'Mates',
  '/friends': 'Friends',
  '/explore': 'Explore',
  '/tracker': 'Tracker',
  '/insights': 'Insights',
  '/achievements': 'Achievements',
  '/coach': 'CoachGPT',
  '/alerts': 'Alerts',
  '/account': 'You',
  '/messages': 'Messages',
  '/hall-of-fame': 'Hall of Fame',
  '/legal': 'Legal',
  '/help': 'Help'
}
// Longest prefix wins, so '/odds/football/x' -> 'Odds', '/messages/123' ->
// 'Messages', '/u/CODE' -> 'Profile'.
const PREFIXES = [
  ['/odds', 'Odds'],
  ['/groups', 'Mates'],
  ['/messages', 'Messages'],
  ['/challenge', 'Challenge'],
  ['/u/', 'Profile'],
  ['/admin', 'Admin']
]

function titleFor(pathname) {
  if (EXACT[pathname]) return EXACT[pathname]
  const hit = PREFIXES.filter(([p]) => pathname.startsWith(p)).sort((a, b) => b[0].length - a[0].length)[0]
  return hit ? hit[1] : null
}

export default function RouteTitle() {
  const { pathname } = useLocation()
  useEffect(() => {
    const section = titleFor(pathname)
    document.title = section ? `${section} · BetMates` : 'BetMates'
    // Capture a pageview on every hash-router navigation. analytics.init() is
    // consent-gated (see src/lib/analytics.js) so this is a silent no-op
    // until the user has accepted cookies.
    analytics.capture('$pageview')
  }, [pathname])
  return null
}
