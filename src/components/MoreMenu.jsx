import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useActivity } from '../context/ActivityContext.jsx'
import { useEscapeKey } from '../lib/useEscapeKey.js'
import { MoreIcon } from './icons/NavIcons.jsx'

const EXPANDED_KEY = 'betmates:moreMenuExpanded'

const GROUPS = [
  {
    key: 'stats',
    label: 'Stats & History',
    items: [
      { to: '/achievements', label: 'Achievements' },
      { to: '/insights', label: 'Insights' },
      { to: '/hall-of-fame', label: 'Hall of Fame' }
    ]
  },
  {
    key: 'support',
    label: 'Support',
    items: [
      { to: '/help', label: 'Help & FAQ' },
      { to: '/legal', label: 'Legal & Privacy' }
    ]
  }
]

// Groups start expanded (nothing here should cost a 3rd tap to reach on
// top of opening this menu) unless the user has actually collapsed one
// themselves before - that choice is what EXPANDED_KEY remembers.
function loadExpanded(allKeys) {
  try {
    const raw = localStorage.getItem(EXPANDED_KEY)
    if (raw == null) return new Set(allKeys)
    return new Set(JSON.parse(raw))
  } catch {
    return new Set(allKeys)
  }
}

// Secondary nav for pages that don't belong on BottomNav's five primary tabs
// - they used to be reachable only through one-off links buried on unrelated
// pages (Achievements/Insights from Tracker, Hall of Fame from the
// Leaderboard segment, Help from the bottom of Account) or, for Discover and
// CoachGPT, only through a bottom-nav slot / a dismissible draggable FAB that
// could be hidden with no way back in. Mounted once at the App shell level
// (there's no persistent per-page top bar to hang a trigger off - every page
// builds its own .topbar independently) so it's present on every screen.
// Renders twice - a mobile trigger + bottom sheet, and a desktop block
// appended below BottomNav's sidebar rows - with CSS (not JS) picking which
// one shows at the 880px breakpoint BottomNav already uses, so there's no
// layout flash while resizing.
export default function MoreMenu() {
  const { user } = useAuth()
  const { hasUnseenMessages } = useActivity()
  const [open, setOpen] = useState(false)

  const groups = user.isAdmin
    ? [
        ...GROUPS,
        {
          key: 'admin',
          label: 'Admin',
          items: [
            { to: '/admin/reports', label: 'Reported posts' },
            { to: '/admin/errors', label: 'Error logs' },
            { to: '/admin/analytics', label: 'Analytics' }
          ]
        }
      ]
    : GROUPS
  const [expanded, setExpanded] = useState(() => loadExpanded(groups.map((g) => g.key)))

  useEscapeKey(() => setOpen(false), open)

  function toggleGroup(key) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      localStorage.setItem(EXPANDED_KEY, JSON.stringify([...next]))
      return next
    })
  }

  return (
    <>
      <button
        type="button"
        className="more-menu-trigger"
        aria-label={`More${hasUnseenMessages ? ' - unread messages' : ''}`}
        onClick={() => setOpen(true)}
      >
        <MoreIcon />
        {hasUnseenMessages && <span className="more-menu-badge" />}
      </button>

      {open && (
        <div className="sheet-backdrop" onClick={() => setOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <h2 className="sheet-title">More</h2>
            <MoreMenuContents groups={groups} expanded={expanded} onToggleGroup={toggleGroup} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      <div className="more-menu-desktop">
        <MoreMenuContents groups={groups} expanded={expanded} onToggleGroup={toggleGroup} />
      </div>
    </>
  )
}

function MoreMenuContents({ groups, expanded, onToggleGroup, onNavigate }) {
  const { hasUnseenMessages } = useActivity()
  return (
    <div className="more-menu-list">
      <Link to="/odds" className="more-menu-item" onClick={onNavigate}>
        Discover
      </Link>
      <Link to="/messages" className="more-menu-item" onClick={onNavigate}>
        Messages
        {hasUnseenMessages && <span className="more-menu-badge" />}
      </Link>
      <Link to="/coach" className="more-menu-item" onClick={onNavigate}>
        CoachGPT
      </Link>
      {groups.map((group) => (
        <div key={group.key} className="more-menu-group">
          <button type="button" className="more-menu-group-toggle" onClick={() => onToggleGroup(group.key)}>
            {group.label}
            <span className="more-menu-caret">{expanded.has(group.key) ? '▾' : '▸'}</span>
          </button>
          {expanded.has(group.key) && (
            <div className="more-menu-group-items">
              {group.items.map((item) => (
                <Link key={item.to} to={item.to} className="more-menu-item" onClick={onNavigate}>
                  {item.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
