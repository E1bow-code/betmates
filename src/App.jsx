import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext.jsx'
import { BetSlipProvider } from './context/BetSlipContext.jsx'
import { ActivityProvider } from './context/ActivityContext.jsx'
import BottomNav from './components/BottomNav.jsx'
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
import TrackerPage from './pages/TrackerPage.jsx'
import AccountPage from './pages/AccountPage.jsx'

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Shell />
      </HashRouter>
    </AuthProvider>
  )
}

function Shell() {
  const { user, loading } = useAuth()

  if (loading) return <div className="loading">Loading BetMates…</div>

  if (!user) {
    return (
      <Routes>
        <Route path="/legal" element={<LegalPage />} />
        <Route path="*" element={<AuthPage />} />
      </Routes>
    )
  }

  return (
    <ActivityProvider userId={user.id}>
      <BetSlipProvider>
        <div className="app-shell">
          <div className="app-content">
            <Routes>
              <Route path="/" element={<Navigate to="/odds" replace />} />
              <Route path="/odds" element={<OddsListPage />} />
              <Route path="/odds/football/:id" element={<FixtureDetailPage />} />
              <Route path="/odds/racing/:id" element={<RaceDetailPage />} />
              <Route path="/odds/ufc/:id" element={<FightDetailPage />} />
              <Route path="/odds/:sportKey/:id" element={<GenericEventDetailPage />} />
              <Route path="/groups" element={<SocialFeedPage />} />
              <Route path="/groups/:id" element={<GroupFeedPage />} />
              <Route path="/tracker" element={<TrackerPage />} />
              <Route path="/account" element={<AccountPage />} />
              <Route path="/legal" element={<LegalPage />} />
              <Route path="*" element={<Navigate to="/odds" replace />} />
            </Routes>
          </div>
          <BetSlipBar />
          <BetBuilderSheet />
          <BottomNav />
        </div>
      </BetSlipProvider>
    </ActivityProvider>
  )
}
