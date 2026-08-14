import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useActivity } from '../context/ActivityContext.jsx'
import { useBetSlip } from '../context/BetSlipContext.jsx'
import { useEscapeKey } from '../lib/useEscapeKey.js'
import { useDelayedClose } from '../lib/useDelayedClose.js'
import { HomeIcon, SocialIcon, TrackerIcon, AccountIcon, PlusIcon } from './icons/NavIcons.jsx'
import { FlameIcon } from './icons/Icons.jsx'

// Home / Mates / + / Tracker / You - Alerts moved to the notification bell
// in AppHeader.jsx. Tracker used to have no nav slot at all (only a teaser
// link buried in Account) despite being the app's core "how am I doing"
// view, so it takes the slot Discover previously held; Discover moved to
// MoreMenu.jsx as a top-level item instead, one tap away either way.
const LEFT_TABS = [
  { to: '/dashboard', label: 'Home', Icon: HomeIcon },
  { to: '/groups', label: 'Mates', Icon: SocialIcon }
]
const RIGHT_TABS = [
  { to: '/tracker', label: 'Tracker', Icon: TrackerIcon },
  { to: '/account', label: 'You', Icon: AccountIcon }
]

function renderTab(tab, hasNewActivity, hasUnseenMessages, showStreak, streak) {
  return (
    <NavLink key={tab.to} to={tab.to} className={({ isActive }) => (isActive ? 'bottom-nav-item active' : 'bottom-nav-item')}>
      <span className="bottom-nav-icon">
        <tab.Icon />
        {tab.to === '/groups' && (hasNewActivity || hasUnseenMessages) && <span className="bottom-nav-dot" />}
      </span>
      <span className="bottom-nav-label">
        {tab.label}
        {tab.to === '/groups' && showStreak && (
          <span className="bottom-nav-streak icon-row">
            <FlameIcon width={11} height={11} />
            {streak.count}
          </span>
        )}
      </span>
    </NavLink>
  )
}

// The "+" FAB used to open ManualEntrySheet directly, but that's only one
// of two things someone taps it for - logging a bet they already placed on
// a bookmaker, or posting a prediction/tip before a game starts. Rather
// than build a third composer, this chooser just routes to the two flows
// that already exist: onAddClick (ManualEntrySheet, via QuickAddContext,
// unchanged) and BetSlipContext's own openSheet (BetBuilderSheet, opened
// pick-less - the same entry point HomePage's composer bar already uses).
function AddChooserSheet({ onClose, onLogBet, onPostPrediction }) {
  const { closing, requestClose } = useDelayedClose(onClose)
  useEscapeKey(requestClose)

  return (
    <div className={`sheet-backdrop${closing ? ' closing' : ''}`} onClick={requestClose}>
      <div className={`sheet${closing ? ' closing' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <h2 className="sheet-title">What are you adding?</h2>
        <div className="sheet-actions">
          <button type="button" className="btn btn-primary" onClick={onPostPrediction}>
            Post a prediction
          </button>
          <button type="button" className="btn btn-secondary" onClick={onLogBet}>
            Log a bet you've placed
          </button>
        </div>
      </div>
    </div>
  )
}

export default function BottomNav({ onAddClick }) {
  const { hasNewActivity, hasUnseenMessages, streak } = useActivity()
  const { openSheet } = useBetSlip()
  const [showChooser, setShowChooser] = useState(false)
  // Only a live win streak gets the badge - a loss streak nagging you from
  // the nav bar every time you open the app is a bad feeling to build in on
  // purpose, even though the same run shows up honestly on Tracker either way.
  const showStreak = streak.type === 'won' && streak.count >= 2

  return (
    <nav className="bottom-nav">
      <Link to="/dashboard" className="sidebar-brand">
        BetMates
      </Link>
      {LEFT_TABS.map((tab) => renderTab(tab, hasNewActivity, hasUnseenMessages, showStreak, streak))}
      <button type="button" className="bottom-nav-fab" onClick={() => setShowChooser(true)} aria-label="Add">
        <PlusIcon />
      </button>
      {RIGHT_TABS.map((tab) => renderTab(tab, hasNewActivity, hasUnseenMessages, showStreak, streak))}
      {showChooser && (
        <AddChooserSheet
          onClose={() => setShowChooser(false)}
          onLogBet={() => {
            setShowChooser(false)
            onAddClick()
          }}
          onPostPrediction={() => {
            setShowChooser(false)
            openSheet()
          }}
        />
      )}
    </nav>
  )
}
