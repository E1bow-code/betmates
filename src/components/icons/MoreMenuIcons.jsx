// Icons for the MoreMenu rows (src/components/MoreMenu.jsx), same bespoke-
// shape/mixed-stroke-weight treatment as NavIcons.jsx (bold outer
// silhouette, thinner inner ink) so the drawer doesn't feel like a
// different icon set from the bar that opens it. Still stroke/currentColor
// throughout so rows inherit the row's text colour and the light/dark swap
// for free. A plain divided list of text links reads as a wall of words; a
// leading glyph per row makes each destination scannable at a glance
// without leaning on emoji (whose fixed platform colour never matches the
// theme - the same reason the bottom nav dropped them).
const base = {
  viewBox: '0 0 24 24',
  width: 18,
  height: 18,
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round'
}

// Magnifier over a clock hand - discover what's on right now.
function DiscoverIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="10.5" cy="10.5" r="6" strokeWidth={2} />
      <path d="M15 15l4.5 4.5" strokeWidth={2.2} />
      <path d="M10.5 7.5V12l3 1.7" strokeWidth={1.3} />
    </svg>
  )
}

// Speech bubble with chip-dots - messages.
function MessagesIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 6h16v9.5H10l-3.5 3v-3H4Z" strokeWidth={2} />
      <circle cx="9.5" cy="10.5" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="14" cy="10.5" r="1.15" fill="currentColor" stroke="none" />
    </svg>
  )
}

// Whistle - CoachGPT.
function CoachIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 10h9l4 1.5a3.5 3.5 0 1 1-4 4.8" strokeWidth={2.1} />
      <path d="M4 10v3.5A2.5 2.5 0 0 0 6.5 16H10" strokeWidth={1.4} />
      <path d="M13 7.5 15 6" strokeWidth={1.4} />
    </svg>
  )
}

// Trophy - achievements.
function AchievementsIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" strokeWidth={2.1} />
      <path d="M7 5H4.5v1.5A3 3 0 0 0 7 9.4M17 5h2.5v1.5A3 3 0 0 1 17 9.4" strokeWidth={1.3} />
      <path d="M12 13v3M9 20h6M10 20l.5-4h3l.5 4" strokeWidth={1.4} />
    </svg>
  )
}

// Ascending bars, boldest on the right - insights over time.
function InsightsIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M5 19V13" strokeWidth={1.4} />
      <path d="M12 19V6" strokeWidth={1.8} />
      <path d="M19 19v-9" strokeWidth={2.3} />
    </svg>
  )
}

// Star - hall of fame.
function HallOfFameIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="m12 4 2.3 4.7 5.2.8-3.8 3.7.9 5.1L12 16.6 7.4 18.1l.9-5.1-3.8-3.7 5.2-.8L12 4Z" strokeWidth={2} />
    </svg>
  )
}

// Question in a circle - help & FAQ.
function HelpIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8.5" strokeWidth={2} />
      <path d="M9.7 9.5a2.3 2.3 0 0 1 4.4.9c0 1.6-2.1 1.9-2.1 3.4" strokeWidth={1.4} />
      <path d="M12 17h.01" strokeWidth={2.2} />
    </svg>
  )
}

// Scales of justice - legal & privacy. Was a shield before, which read as
// near-identical to AccountIcon's badge in NavIcons.jsx once that moved to
// a shield shape too - scales keep the two visually distinct.
function LegalIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 4v16" strokeWidth={1.8} />
      <path d="M6 8h12" strokeWidth={1.8} />
      <path d="M6 8 3.5 13a2.5 2.5 0 0 0 5 0L6 8Z" strokeWidth={1.3} />
      <path d="M18 8l-2.5 5a2.5 2.5 0 0 0 5 0L18 8Z" strokeWidth={1.3} />
      <path d="M9 20h6" strokeWidth={2} />
    </svg>
  )
}

// Flag - reported posts.
function ReportsIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M6 3v18" strokeWidth={2} />
      <path d="M6 4h11l-2.5 4L17 12H6" strokeWidth={1.4} />
    </svg>
  )
}

// Warning triangle - error logs.
function ErrorsIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 4 21 19H3L12 4Z" strokeWidth={2.1} />
      <path d="M12 10v4" strokeWidth={1.6} />
      <path d="M12 17h.01" strokeWidth={2.2} />
    </svg>
  )
}

// Pie slice - analytics.
function AnalyticsIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 4a8 8 0 1 0 8 8h-8V4Z" strokeWidth={1.8} />
      <path d="M14 4.5A7.5 7.5 0 0 1 19.5 10H14V4.5Z" strokeWidth={1.4} />
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
