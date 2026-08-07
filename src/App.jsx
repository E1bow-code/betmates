import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { HashRouter, Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext.jsx'
import { BetSlipProvider } from './context/BetSlipContext.jsx'
import { ActivityProvider } from './context/ActivityContext.jsx'
import { OddsFormatProvider } from './context/OddsFormatContext.jsx'
import { ToastProvider } from './context/ToastContext.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import BottomNav from './components/BottomNav.jsx'
import MoreMenu from './components/MoreMenu.jsx'
import InstallGuideBanner from './components/InstallGuideBanner.jsx'
import OnboardingTour from './components/OnboardingTour.jsx'
import RealityCheck from './components/RealityCheck.jsx'
import BetSlipBar from './components/BetSlipBar.jsx'
import BetBuilderSheet from './components/BetBuilderSheet.jsx'
// AuthPage is the one page kept as a regular (non-lazy) import - it's the
// very first thing a logged-out visitor sees, so splitting it would add a
// network round-trip to the app's most common cold-start path instead of
// saving one. Every other route only matters once someone's signed in and
// already has the shell loaded, so lazy-loading them shrinks the initial
// bundle (see the recurring "chunks larger than 500kB" build warning)
// without costing anything on that critical first paint.
import AuthPage from './pages/AuthPage.jsx'
const LegalPage = lazy(() => import('./pages/LegalPage.jsx'))
const HelpPage = lazy(() => import('./pages/HelpPage.jsx'))
const HomePage = lazy(() => import('./pages/HomePage.jsx'))
const OddsListPage = lazy(() => import('./pages/OddsListPage.jsx'))
const FixtureDetailPage = lazy(() => import('./pages/FixtureDetailPage.jsx'))
const RaceDetailPage = lazy(() => import('./pages/RaceDetailPage.jsx'))
const FightDetailPage = lazy(() => import('./pages/FightDetailPage.jsx'))
const GenericEventDetailPage = lazy(() => import('./pages/GenericEventDetailPage.jsx'))
const SocialFeedPage = lazy(() => import('./pages/SocialFeedPage.jsx'))
const GroupFeedPage = lazy(() => import('./pages/GroupFeedPage.jsx'))
const JoinGroupPage = lazy(() => import('./pages/JoinGroupPage.jsx'))
const TrackerPage = lazy(() => import('./pages/TrackerPage.jsx'))
const AccountPage = lazy(() => import('./pages/AccountPage.jsx'))
const PublicProfilePage = lazy(() => import('./pages/PublicProfilePage.jsx'))
const NotificationsPage = lazy(() => import('./pages/NotificationsPage.jsx'))
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage.jsx'))
const AchievementsPage = lazy(() => import('./pages/AchievementsPage.jsx'))
const InsightsPage = lazy(() => import('./pages/InsightsPage.jsx'))
const HallOfFamePage = lazy(() => import('./pages/HallOfFamePage.jsx'))
const AdminReportsPage = lazy(() => import('./pages/AdminReportsPage.jsx'))
const DirectMessagePage = lazy(() => import('./pages/DirectMessagePage.jsx'))
const MessagesInboxPage = lazy(() => import('./pages/MessagesInboxPage.jsx'))
import NewsTickerBar from './components/NewsTickerBar.jsx'
import ScatteredSportPhotos from './components/ScatteredSportPhotos.jsx'
import NewsSidebar from './components/NewsSidebar.jsx'
import { fetchSportsNews } from './api/newsClient.js'
import { PENDING_REFERRAL_KEY } from './lib/referral.js'

const NEWS_REFRESH_MS = 10 * 60 * 1000

const PENDING_JOIN_KEY = 'betmates:pendingJoinCode'

export default function App() {
  // Outside the providers as well as the router: a throw in AuthProvider's
  // own initialisation would otherwise have nothing above it to catch, which
  // is the one case where a blank page is hardest to diagnose.
  return (
    <ErrorBoundary>
      <AuthProvider>
        <OddsFormatProvider>
          <ToastProvider>
            <HashRouter>
              <Shell />
            </HashRouter>
          </ToastProvider>
        </OddsFormatProvider>
      </AuthProvider>
    </ErrorBoundary>
  )
}

// A shared invite link (src/lib/share.js's groupInviteUrl) can land on
// someone who isn't signed in yet - the whole point of a link over a bare
// code is one tap, not "remember this code, sign up, then go type it in
// somewhere". This stashes the code and lands them on sign-up/sign-in;
// Shell below picks it back up once they're authenticated.
function StashJoinCode() {
  const { code } = useParams()
  useEffect(() => {
    if (code) localStorage.setItem(PENDING_JOIN_KEY, code)
  }, [code])
  return <Navigate to="/" replace />
}

// Same idea as StashJoinCode, but a referral only ever matters once - at
// the sign-up insert itself (see AuthPage.jsx) - not after an authenticated
// action, so there's no HomeRedirect-style pickup step needed. Landing on
// "/" for a logged-out visitor already shows AuthPage, which reads this key
// directly when the sign-up form submits.
function StashReferralCode() {
  const { code } = useParams()
  useEffect(() => {
    if (code) localStorage.setItem(PENDING_REFERRAL_KEY, code)
  }, [code])
  return <Navigate to="/" replace />
}

// StrictMode (see main.jsx) intentionally double-invokes effects in dev -
// mount, cleanup, mount again - to catch impure ones. An effect that reads
// AND consumes localStorage state and branches its navigate() target on
// what it found breaks under that: the second invocation sees the
// already-consumed state and takes the *other* branch, and since it fires
// last, its navigate() call is the one that sticks. The `handled` ref
// makes only the first invocation actually do anything, same as this
// component would behave with StrictMode off / in production.
function HomeRedirect() {
  const navigate = useNavigate()
  const handled = useRef(false)

  useEffect(() => {
    if (handled.current) return
    handled.current = true
    const pending = localStorage.getItem(PENDING_JOIN_KEY)
    if (pending) {
      localStorage.removeItem(PENDING_JOIN_KEY)
      navigate(`/join/${pending}`, { replace: true })
    } else {
      navigate('/dashboard', { replace: true })
    }
  }, [navigate])

  return null
}

const ONBOARDED_PREFIX = 'betmates:onboarded:'

function Shell() {
  const { user, loading, passwordRecovery, recoveryFailed } = useAuth()
  const [showTour, setShowTour] = useState(false)
  const [newsHeadlines, setNewsHeadlines] = useState([])

  useEffect(() => {
    if (user && !localStorage.getItem(ONBOARDED_PREFIX + user.id)) setShowTour(true)
  }, [user])

  // Fetched once here rather than inside NewsTickerBar/NewsSidebar
  // individually so the two - one shown on narrow screens, the other on
  // wide ones (see style.css's 1280px breakpoint) - share a single poll
  // instead of doubling up requests neither of them needs on its own.
  useEffect(() => {
    if (!user) return
    let cancelled = false
    function load() {
      fetchSportsNews()
        .then((items) => !cancelled && setNewsHeadlines(items))
        .catch(() => {})
    }
    load()
    const interval = setInterval(load, NEWS_REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [user])

  function dismissTour() {
    if (user) localStorage.setItem(ONBOARDED_PREFIX + user.id, '1')
    setShowTour(false)
  }

  // Checked ahead of both the loading and auth-state branches below - a
  // recovery session still counts as "signed in" as far as Supabase and the
  // `user`/`loading` state above are concerned, so without this check
  // they'd fall straight through to the normal signed-in app instead of the
  // reset-password form. See AuthContext.jsx/dataStore.js's
  // onAuthStateChange for why this reads a state flag rather than the URL.
  if (passwordRecovery) {
    return (
      <Suspense fallback={<div className="loading">Loading BetMates…</div>}>
        <ResetPasswordPage />
      </Suspense>
    )
  }

  // AuthContext's own timeout firing: a recovery link was clicked (the URL
  // had the tell-tale hash) but PASSWORD_RECOVERY never arrived - a flaky
  // connection or slow boot most likely. Previously this fell straight
  // through to a normal sign-in screen with no indication anything had
  // even been attempted, which is exactly what got reported as "the reset
  // link doesn't work on mobile."
  if (recoveryFailed) {
    return (
      <div className="auth-page">
        <div className="auth-page-scrim" />
        <div className="auth-card">
          <h1 className="auth-title">BetMates</h1>
          <p className="auth-subtitle">That reset link didn't work</p>
          <p className="hint">
            This can happen on a slow or unstable connection. Go back and request a fresh link, then open it again
            once you've got a solid signal.
          </p>
          <button className="btn btn-primary" onClick={() => window.location.replace(window.location.origin + '/')}>
            Back to sign in
          </button>
        </div>
      </div>
    )
  }

  if (loading) return <div className="loading">Loading BetMates…</div>

  if (!user) {
    return (
      <Suspense fallback={<div className="loading">Loading BetMates…</div>}>
        <Routes>
          <Route path="/legal" element={<LegalPage />} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="/join/:code" element={<StashJoinCode />} />
          <Route path="/r/:code" element={<StashReferralCode />} />
          <Route path="/u/:code" element={<PublicProfilePage />} />
          <Route path="/hall-of-fame" element={<HallOfFamePage />} />
          <Route path="*" element={<AuthPage />} />
        </Routes>
      </Suspense>
    )
  }

  return (
    <ActivityProvider userId={user.id}>
      <BetSlipProvider>
        <ScatteredSportPhotos />
        <NewsTickerBar headlines={newsHeadlines} />
        <div className="app-shell">
          <div className="app-content">
            <InstallGuideBanner />
            <Suspense fallback={<div className="loading">Loading…</div>}>
              <Routes>
                <Route path="/" element={<HomeRedirect />} />
                <Route path="/dashboard" element={<HomePage />} />
                <Route path="/odds" element={<OddsListPage />} />
                <Route path="/odds/football/:id" element={<FixtureDetailPage />} />
                <Route path="/odds/racing/:id" element={<RaceDetailPage />} />
                <Route path="/odds/ufc/:id" element={<FightDetailPage />} />
                <Route path="/odds/:sportKey/:id" element={<GenericEventDetailPage />} />
                <Route path="/groups" element={<SocialFeedPage />} />
                <Route path="/groups/:id" element={<GroupFeedPage />} />
                <Route path="/join/:code" element={<JoinGroupPage />} />
                <Route path="/messages" element={<MessagesInboxPage />} />
                <Route path="/messages/:friendId" element={<DirectMessagePage />} />
                <Route path="/tracker" element={<TrackerPage />} />
                <Route path="/achievements" element={<AchievementsPage />} />
                <Route path="/insights" element={<InsightsPage />} />
                <Route path="/alerts" element={<NotificationsPage />} />
                <Route path="/account" element={<AccountPage />} />
                <Route path="/admin/reports" element={<AdminReportsPage />} />
                <Route path="/u/:code" element={<PublicProfilePage />} />
                <Route path="/hall-of-fame" element={<HallOfFamePage />} />
                <Route path="/legal" element={<LegalPage />} />
                <Route path="/help" element={<HelpPage />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </Suspense>
          </div>
          <BetSlipBar />
          <BetBuilderSheet />
          <div className="sidebar-nav">
            <BottomNav />
            <MoreMenu />
          </div>
          <NewsSidebar headlines={newsHeadlines} />
          {showTour && <OnboardingTour onDone={dismissTour} />}
          <RealityCheck />
        </div>
      </BetSlipProvider>
    </ActivityProvider>
  )
}
