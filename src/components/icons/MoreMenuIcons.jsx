// Line icons for the MoreMenu rows (src/components/MoreMenu.jsx), same
// stroke/currentColor treatment as NavIcons.jsx so they inherit the row's
// text colour and the light/dark swap for free. A plain divided list of text
// links reads as a wall of words; a leading glyph per row makes each
// destination scannable at a glance without leaning on emoji (whose fixed
// platform colour never matches the theme - the same reason the bottom nav
// dropped them).
const base = {
  viewBox: '0 0 24 24',
  width: 18,
  height: 18,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round'
}

// Compass - discover what's on.
function DiscoverIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m15 9-1.6 4.4L9 15l1.6-4.4L15 9Z" />
    </svg>
  )
}

// Speech bubble - messages.
function MessagesIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M5 6h14v9H9l-4 3.5V6Z" />
    </svg>
  )
}

// Whistle - CoachGPT.
function CoachIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 10h9l4 1.5a3.5 3.5 0 1 1-4 4.8" />
      <path d="M4 10v3.5A2.5 2.5 0 0 0 6.5 16H10" />
      <path d="M13 7.5 15 6" />
    </svg>
  )
}

// Trophy - achievements.
function AchievementsIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" />
      <path d="M7 5H4.5v1.5A3 3 0 0 0 7 9.4M17 5h2.5v1.5A3 3 0 0 1 17 9.4" />
      <path d="M12 13v3M9 20h6M10 20l.5-4h3l.5 4" />
    </svg>
  )
}

// Rising bars - insights.
function InsightsIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M5 19V13M12 19V6M19 19v-9" />
    </svg>
  )
}

// Star - hall of fame.
function HallOfFameIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="m12 4 2.3 4.7 5.2.8-3.8 3.7.9 5.1L12 16.6 7.4 18.1l.9-5.1-3.8-3.7 5.2-.8L12 4Z" />
    </svg>
  )
}

// Question in a circle - help & FAQ.
function HelpIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.7 9.5a2.3 2.3 0 0 1 4.4.9c0 1.6-2.1 1.9-2.1 3.4" />
      <path d="M12 17h.01" />
    </svg>
  )
}

// Shield - legal & privacy.
function LegalIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3.5 19 6v5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6l7-2.5Z" />
    </svg>
  )
}

// Flag - reported posts.
function ReportsIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M6 3v18M6 4h11l-2.5 4L17 12H6" />
    </svg>
  )
}

// Warning triangle - error logs.
function ErrorsIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 4 21 19H3L12 4Z" />
      <path d="M12 10v4M12 17h.01" />
    </svg>
  )
}

// Pie slice - analytics.
function AnalyticsIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 4a8 8 0 1 0 8 8h-8V4Z" />
      <path d="M14 4.5A7.5 7.5 0 0 1 19.5 10H14V4.5Z" />
    </svg>
  )
}

// Route -> icon. MoreMenu.jsx looks this up per row; anything without an
// entry just renders no glyph (the row still works, it's decorative).
export const MORE_MENU_ICONS = {
  '/odds': DiscoverIcon,
  '/messages': MessagesIcon,
  '/coach': CoachIcon,
  '/achievements': AchievementsIcon,
  '/insights': InsightsIcon,
  '/hall-of-fame': HallOfFameIcon,
  '/help': HelpIcon,
  '/legal': LegalIcon,
  '/admin/reports': ReportsIcon,
  '/admin/errors': ErrorsIcon,
  '/admin/analytics': AnalyticsIcon
}
