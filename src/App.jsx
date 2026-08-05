import { useEffect, useRef, useState } from 'react'
import { HashRouter, Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext.jsx'
import { BetSlipProvider } from './context/BetSlipContext.jsx'
import { ActivityProvider } from './context/ActivityContext.jsx'
import { OddsFormatProvider } from './context/OddsFormatContext.jsx'
import BottomNav from './components/BottomNav.jsx'
import InstallGuideBanner from './components/InstallGuideBanner.jsx'
import OnboardingTour from './components/OnboardingTour.jsx'
import BetSlipBar from './components/BetSlipBar.jsx'
import BetBuilderSheet from './components/BetBuilderSheet.jsx'
import AuthPage from './pages/AuthPage.jsx'
import LegalPage from './pages/LegalPage.jsx'
import OddsListPage from './pages/OddsListPage.jsx'
import FixtureDetailPage from './pages/FixtureDetailPage.jsx'
import RaceDetailPage from './pages/RaceDetailPage.jsx'
import FightDetailPage from './pages/FightDetailPage.jsx'
import GenericEventDetailPage from './pages/GenericEventDetailPage.jsx'
import SocialFeedPage from './pages/SocialFeedPage.jsx'
import GroupFeedPage from './pages/GroupFeedPage.jsx'
import JoinGroupPage from './pages/JoinGroupPage.jsx'
import TrackerPage from './pages/TrackerPage.jsx'
import AccountPage from './pages/AccountPage.jsx'
import PublicProfilePage from './pages/PublicProfilePage.jsx'
import NotificationsPage from './pages/NotificationsPage.jsx'
import ResetPasswordPage from './pages/ResetPasswordPage.jsx'
import AchievementsPage from './pages/AchievementsPage.jsx'
import InsightsPage from './pages/InsightsPage.jsx'
import HallOfFamePage from './pages/HallOfFamePage.jsx'
import AdminReportsPage from './pages/AdminReportsPage.jsx'
import DirectMessagePage from './pages/DirectMessagePage.jsx'
import MessagesInboxPage from './pages/MessagesInboxPage.jsx'
import { PENDING_REFERRAL_KEY } from './lib/referral.js'

const PENDING_JOIN_KEY = 'betmates:pendingJoinCode'

export default function App() {
  return (
    <AuthProvider>
      <OddsFormatProvider>
        <HashRouter>
          <Shell />
        </HashRouter>
      </OddsFormatProvider>
    </AuthProvider>
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
      navigate('/odds', { replace: true })
    }
  }, [navigate])

  return null
}

const ONBOARDED_PREFIX = 'betmates:onboarded:'

function Shell() {
  const { user, loading } = useAuth()
  const [showTour, setShowTour] = useState(false)

  useEffect(() => {
    if (user && !localStorage.getItem(ONBOARDED_PREFIX + user.id)) setShowTour(true)
  }, [user])

  function dismissTour() {
    if (user) localStorage.setItem(ONBOARDED_PREFIX + user.id, '1')
    setShowTour(false)
  }

  // Supabase's password-recovery redirect also lands on a URL fragment
  // (#access_token=...&type=recovery), which HashRouter would otherwise try
  // to parse as a route - checking for it directly here, ahead of both the
  // loading and auth-state branches, sidesteps that collision entirely.
  if (window.location.hash.includes('type=recovery')) {
    return <ResetPasswordPage />
  }

  if (loading) return <div className="loading">Loading BetMates…</div>

  if (!user) {
    return (
      <Routes>
        <Route path="/legal" element={<LegalPage />} />
        <Route path="/join/:code" element={<StashJoinCode />} />
        <Route path="/r/:code" element={<StashReferralCode />} />
        <Route path="/u/:code" element={<PublicProfilePage />} />
        <Route path="/hall-of-fame" element={<HallOfFamePage />} />
        <Route path="*" element={<AuthPage />} />
      </Routes>
    )
  }

  return (
    <ActivityProvider userId={user.id}>
      <BetSlipProvider>
        <div className="app-shell">
          <div className="app-content">
            <InstallGuideBanner />
            <Routes>
              <Route path="/" element={<HomeRedirect />} />
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
              <Route path="*" element={<Navigate to="/odds" replace />} />
            </Routes>
          </div>
          <BetSlipBar />
          <BetBuilderSheet />
          <BottomNav />
          {showTour && <OnboardingTour onDone={dismissTour} />}
        </div>
      </BetSlipProvider>
    </ActivityProvider>
  )
}
