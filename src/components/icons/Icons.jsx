// General-purpose UI icons, same hand-drawn line treatment as NavIcons.jsx/
// SportIcons.jsx - replaces the emoji sprinkled through BetCard.jsx,
// HomePage.jsx, SocialFeedPage.jsx, BetBuilderSheet.jsx, and friends.
// Emoji render as fixed platform glyphs (a different shape on iOS vs.
// Android vs. Windows, a fixed colour that ignores the theme), which is
// exactly the kind of generic "obviously AI-built" tell these replace -
// currentColor strokes pick up .accent/.bad/dimmed text colour and the
// light/dark theme swap for free, the way real icons should.
const base = {
  viewBox: '0 0 24 24',
  width: 18,
  height: 18,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round'
}

// Win-streak heat.
export function FlameIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3c1 3-2.5 4-2.5 7a2.5 2.5 0 0 0 5 0c1.5 1 2 2.6 2 4a4.5 4.5 0 0 1-9 0c0-4 3-5.5 3-8.5 0-1-.3-1.8-.5-2.5Z" />
    </svg>
  )
}

// Cold streak - the flame's opposite number.
export function SnowflakeIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3v18M4.5 7.5l15 9M19.5 7.5l-15 9" />
      <path d="M12 3l-1.6 1.6M12 3l1.6 1.6M12 21l-1.6-1.6M12 21l1.6-1.6" />
    </svg>
  )
}

// Calendar - dates, "on this day".
export function CalendarIcon(props) {
  return (
    <svg {...base} {...props}>
      <rect x="4" y="5.5" width="16" height="14" rx="2" />
      <path d="M4 10h16M8 3.5v4M16 3.5v4" />
    </svg>
  )
}

// Video camera - record/watch a clip.
export function VideoIcon(props) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="7" width="12" height="10" rx="1.8" />
      <path d="M15.5 10.5 20.5 7.5v9l-5-3Z" />
    </svg>
  )
}

// Speech bubble - comments/chat.
export function CommentIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4H6.5A2.5 2.5 0 0 1 4 13.5v-7Z" />
    </svg>
  )
}

// Magnifying glass - search.
export function SearchIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5 5" />
    </svg>
  )
}

// Trophy - leaderboards, hall of fame.
export function TrophyIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M7 5.5H4.5A2.5 2.5 0 0 0 7 9M17 5.5h2.5A2.5 2.5 0 0 1 17 9" />
      <path d="M12 14v3.5M9 20.5h6M9.5 17.5h5l.5 3H9l.5-3Z" />
    </svg>
  )
}

// Target - value bets, confidence picks.
export function TargetIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

// Bank/bookmaker.
export function BankIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 9.5 12 4l8 5.5" />
      <path d="M4.5 9.5h15M6 9.5v8M10 9.5v8M14 9.5v8M18 9.5v8" />
      <path d="M3.5 19.5h17" />
    </svg>
  )
}

// Newspaper - sports news feed.
export function NewsIcon(props) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="5.5" width="13" height="13" rx="1.5" />
      <path d="M16.5 8.5h2A2 2 0 0 1 20.5 10.5v6a2 2 0 0 1-2 2h-2" />
      <path d="M6.5 9h6M6.5 12h6M6.5 15h4" />
    </svg>
  )
}

// Two people - followers, mates.
export function PeopleIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="8.5" cy="8.5" r="2.8" />
      <path d="M3.5 19c0-3 2.3-5 5-5s5 2 5 5" />
      <circle cx="16.5" cy="9.5" r="2.2" />
      <path d="M14.8 14.3c2.5 0 5 1.5 5.5 4.7" />
    </svg>
  )
}

// Crossed swords - head-to-head challenges.
export function SwordsIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M5 19 18 6M5 6l13 13" />
      <path d="M5 19l-1.5 1.5M18 6l1.5-1.5M5 6 3.5 4.5M18 19l1.5 1.5" />
    </svg>
  )
}

// Bell with a slash - muted notifications.
export function BellOffIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M6 10.5a6 6 0 0 1 10.4-4M17.9 10.5c0 3.2 1.1 4.7 1.5 5.2H4.6S6 14.3 6 10.5" />
      <path d="M10.2 19a1.9 1.9 0 0 0 3.6 0" />
      <path d="M4 4l16 16" />
    </svg>
  )
}

// Thumbs up - "lock in" reaction.
export function ThumbsUpIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M8 20h9a2 2 0 0 0 2-1.6l1-6A1.5 1.5 0 0 0 18.5 10.5H14l.8-4.3a1.6 1.6 0 0 0-2.9-1.2L8 10.5" />
      <path d="M8 10.5V20" />
      <path d="M4 10.5h4V20H4a1 1 0 0 1-1-1V11.5a1 1 0 0 1 1-1Z" />
    </svg>
  )
}

// Uncertain face - "not sure" reaction.
export function UnsureFaceIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9 10h.01M15 10h.01" strokeWidth="2.4" />
      <path d="M9 15.5c1-1 5-1 6 0" />
    </svg>
  )
}

// Chain link - correlated/parlay legs.
export function LinkIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M10 14 14 10" />
      <path d="M11 7.5l1.5-1.5a3.5 3.5 0 0 1 5 5L16 12.5" />
      <path d="M13 16.5 11.5 18a3.5 3.5 0 0 1-5-5L8 11.5" />
    </svg>
  )
}

// Camera - photo attachment/scan.
export function CameraIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7H8l1-1.5h6L16 7h2.5A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5v-9Z" />
      <circle cx="12" cy="13" r="3.2" />
    </svg>
  )
}

// Spark - CoachGPT/AI, abstract rather than a literal brain (holds up
// better at inline text size).
export function SparkIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3.5c.6 3 2.5 4.9 5.5 5.5-3 .6-4.9 2.5-5.5 5.5-.6-3-2.5-4.9-5.5-5.5 3-.6 4.9-2.5 5.5-5.5Z" />
      <path d="M18.5 15.5c.3 1.4 1.1 2.2 2.5 2.5-1.4.3-2.2 1.1-2.5 2.5-.3-1.4-1.1-2.2-2.5-2.5 1.4-.3 2.2-1.1 2.5-2.5Z" />
    </svg>
  )
}

// Warning triangle - heads-up nudges.
export function WarningIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 4.5 21 19H3L12 4.5Z" />
      <path d="M12 10v4M12 16.5h.01" strokeWidth="2.2" />
    </svg>
  )
}

// Two eyes - "watching for" / being watched.
export function EyesIcon(props) {
  return (
    <svg {...base} {...props}>
      <ellipse cx="8" cy="12" rx="3" ry="3.6" />
      <ellipse cx="16" cy="12" rx="3" ry="3.6" />
      <circle cx="8" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="16" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

// Set-square ruler - staking-plan math.
export function RulerIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 20 20 4" />
      <path d="M4 20 20 20 20 4" />
      <path d="M13 20v-3M16 20v-3M19 20v-3" />
    </svg>
  )
}

// Rising line - stats/trend.
export function TrendUpIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 16 9.5 10.5 13.5 14.5 20 6" />
      <path d="M15 6h5v5" />
    </svg>
  )
}

// Falling line - the opposite trend.
export function TrendDownIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 8 9.5 13.5 13.5 9.5 20 18" />
      <path d="M15 18h5v-5" />
    </svg>
  )
}

// Megaphone - trending/announcements.
export function MegaphoneIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 10.5v3a1.5 1.5 0 0 0 1.5 1.5H7l8 4V5l-8 4H5.5A1.5 1.5 0 0 0 4 10.5Z" />
      <path d="M18.5 9.5a4 4 0 0 1 0 5" />
    </svg>
  )
}

// Pushpin - tags.
export function PinIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M9 4h6l-1 6 4 4h-6v6l-1 1-1-1v-6H5l4-4-1-6Z" />
    </svg>
  )
}

// Curved share arrow.
export function ShareIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M8 12a5.5 5.5 0 0 1 9-4.3" />
      <path d="M13.5 4.5 17 7.7l-3.5 3.2" />
      <path d="M8 12v6.5A1.5 1.5 0 0 0 9.5 20h8a1.5 1.5 0 0 0 1.5-1.5V13" />
    </svg>
  )
}

// Box with an outbound arrow - sharp-money / export.
export function ExportIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3v11" />
      <path d="M8 7l4-4 4 4" />
      <path d="M5 14v4.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V14" />
    </svg>
  )
}

// Confetti burst - welcome/celebration moments.
export function CelebrateIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 12 5 20" />
      <path d="M9 5.5l.7 1.9M14.5 4l-.4 2M18 8.5l-1.9.7M19 13l-2 .3M6 10l1.7 1" />
      <circle cx="16.5" cy="16.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

// Bell - price/odds alerts.
export function BellIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M6 10.5a6 6 0 0 1 12 0c0 3.2 1.1 4.7 1.5 5.2H4.5S6 14.3 6 10.5Z" />
      <path d="M10.2 19a1.9 1.9 0 0 0 3.6 0" />
    </svg>
  )
}

// Diamond - best-value edges.
export function DiamondIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M7 4h10l4 5.5L12 21 3 9.5 7 4Z" />
      <path d="M3 9.5h18M9.5 4 8 9.5 12 21M14.5 4 16 9.5 12 21" />
    </svg>
  )
}

// Film reel - watch highlights.
export function FilmIcon(props) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="5" width="17" height="14" rx="1.8" />
      <path d="M8 5v14M16 5v14M3.5 9.5H8M16 9.5h4.5M3.5 14.5H8M16 14.5h4.5" />
    </svg>
  )
}

// TV screen - watch live.
export function TvIcon(props) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="6.5" width="18" height="12.5" rx="1.8" />
      <path d="M8 3.5 12 6.5 16 3.5" />
    </svg>
  )
}

// Outbound arrow - external profile/social links.
export function ArrowUpRightIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M7 17 17 7" />
      <path d="M9 7h8v8" />
    </svg>
  )
}
