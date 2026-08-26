// General-purpose UI icons, same hand-drawn treatment as NavIcons.jsx/
// SportIcons.jsx - replaces the emoji sprinkled through BetCard.jsx,
// HomePage.jsx, GroupsHomePage.jsx, BetBuilderSheet.jsx, and friends.
// Emoji render as fixed platform glyphs (a different shape on iOS vs.
// Android vs. Windows, a fixed colour that ignores the theme), which is
// exactly the kind of generic "obviously AI-built" tell these replace -
// currentColor strokes pick up .accent/.bad/dimmed text colour and the
// light/dark theme swap for free. Mixed stroke weight (bold outer
// silhouette, thinner inner ink) rather than one uniform width throughout -
// see NavIcons.jsx's header comment for why a single constant weight
// stopped being a point of difference and started being its own tell.
const base = {
  viewBox: '0 0 24 24',
  width: 18,
  height: 18,
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round'
}

// Win-streak heat.
export function FlameIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3c1 3-2.5 4-2.5 7a2.5 2.5 0 0 0 5 0c1.5 1 2 2.6 2 4a4.5 4.5 0 0 1-9 0c0-4 3-5.5 3-8.5 0-1-.3-1.8-.5-2.5Z" strokeWidth={2} />
    </svg>
  )
}

// Cold streak - the flame's opposite number.
export function SnowflakeIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3v18M4.5 7.5l15 9M19.5 7.5l-15 9" strokeWidth={1.8} />
      <path d="M12 3l-1.6 1.6M12 3l1.6 1.6M12 21l-1.6-1.6M12 21l1.6-1.6" strokeWidth={1.3} />
    </svg>
  )
}

// Calendar - dates, "on this day".
export function CalendarIcon(props) {
  return (
    <svg {...base} {...props}>
      <rect x="4" y="5.5" width="16" height="14" rx="2" strokeWidth={2.1} />
      <path d="M4 10h16M8 3.5v4M16 3.5v4" strokeWidth={1.4} />
    </svg>
  )
}

// Video camera - record/watch a clip.
export function VideoIcon(props) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="7" width="12" height="10" rx="1.8" strokeWidth={2.1} />
      <path d="M15.5 10.5 20.5 7.5v9l-5-3Z" strokeWidth={1.5} />
    </svg>
  )
}

// Speech bubble with chip-dots - comments/chat. Matches MoreMenuIcons.jsx's
// MessagesIcon treatment rather than a plain outline bubble, since the two
// render side by side in places like NotificationsPage.
export function CommentIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4H6.5A2.5 2.5 0 0 1 4 13.5v-7Z" strokeWidth={2} />
      <circle cx="9.5" cy="10" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="10" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  )
}

// Magnifying glass - search.
export function SearchIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="10.5" cy="10.5" r="6" strokeWidth={2} />
      <path d="M15 15l5 5" strokeWidth={2.2} />
    </svg>
  )
}

// Trophy - leaderboards, hall of fame.
export function TrophyIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" strokeWidth={2.1} />
      <path d="M7 5.5H4.5A2.5 2.5 0 0 0 7 9M17 5.5h2.5A2.5 2.5 0 0 1 17 9" strokeWidth={1.3} />
      <path d="M12 14v3.5M9 20.5h6M9.5 17.5h5l.5 3H9l.5-3Z" strokeWidth={1.5} />
    </svg>
  )
}

// Target - value bets, confidence picks.
export function TargetIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8.5" strokeWidth={2.1} />
      <circle cx="12" cy="12" r="4.5" strokeWidth={1.4} />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

// Bank/bookmaker.
export function BankIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 9.5 12 4l8 5.5" strokeWidth={2.1} />
      <path d="M4.5 9.5h15M6 9.5v8M10 9.5v8M14 9.5v8M18 9.5v8" strokeWidth={1.3} />
      <path d="M3.5 19.5h17" strokeWidth={1.8} />
    </svg>
  )
}

// Newspaper - sports news feed.
export function NewsIcon(props) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="5.5" width="13" height="13" rx="1.5" strokeWidth={2.1} />
      <path d="M16.5 8.5h2A2 2 0 0 1 20.5 10.5v6a2 2 0 0 1-2 2h-2" strokeWidth={1.5} />
      <path d="M6.5 9h6M6.5 12h6M6.5 15h4" strokeWidth={1.3} />
    </svg>
  )
}

// Two overlapping poker chips - followers, mates. Matches NavIcons.jsx's
// SocialIcon treatment rather than the plain two-circle-person shape that
// used to live here.
export function PeopleIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="9" cy="12.5" r="5" strokeWidth={2.1} />
      <circle cx="9" cy="12.5" r="2.3" strokeWidth={1.2} />
      <circle cx="15.5" cy="9.5" r="3.4" strokeWidth={1.5} />
    </svg>
  )
}

// Crossed swords - head-to-head challenges.
export function SwordsIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M5 19 18 6M5 6l13 13" strokeWidth={2} />
      <path d="M5 19l-1.5 1.5M18 6l1.5-1.5M5 6 3.5 4.5M18 19l1.5 1.5" strokeWidth={1.4} />
    </svg>
  )
}

// Bell with a slash - muted notifications.
export function BellOffIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M6 10.5a6 6 0 0 1 10.4-4M17.9 10.5c0 3.2 1.1 4.7 1.5 5.2H4.6S6 14.3 6 10.5" strokeWidth={2.1} />
      <path d="M10.2 19a1.9 1.9 0 0 0 3.6 0" strokeWidth={1.4} />
      <path d="M4 4l16 16" strokeWidth={2.2} />
    </svg>
  )
}

// Thumbs up - "lock in" reaction.
export function ThumbsUpIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M8 20h9a2 2 0 0 0 2-1.6l1-6A1.5 1.5 0 0 0 18.5 10.5H14l.8-4.3a1.6 1.6 0 0 0-2.9-1.2L8 10.5" strokeWidth={2} />
      <path d="M8 10.5V20" strokeWidth={1.6} />
      <path d="M4 10.5h4V20H4a1 1 0 0 1-1-1V11.5a1 1 0 0 1 1-1Z" strokeWidth={1.6} />
    </svg>
  )
}

// Uncertain face - "not sure" reaction.
export function UnsureFaceIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8.5" strokeWidth={2} />
      <path d="M9 10h.01M15 10h.01" strokeWidth={2.4} />
      <path d="M9 15.5c1-1 5-1 6 0" strokeWidth={1.5} />
    </svg>
  )
}

// Chain link - correlated/parlay legs.
export function LinkIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M10 14 14 10" strokeWidth={1.5} />
      <path d="M11 7.5l1.5-1.5a3.5 3.5 0 0 1 5 5L16 12.5" strokeWidth={1.9} />
      <path d="M13 16.5 11.5 18a3.5 3.5 0 0 1-5-5L8 11.5" strokeWidth={1.9} />
    </svg>
  )
}

// Camera - photo attachment/scan.
export function CameraIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7H8l1-1.5h6L16 7h2.5A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5v-9Z" strokeWidth={2.1} />
      <circle cx="12" cy="13" r="3.2" strokeWidth={1.5} />
    </svg>
  )
}

// Spark - CoachGPT/AI, abstract rather than a literal brain (holds up
// better at inline text size).
export function SparkIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3.5c.6 3 2.5 4.9 5.5 5.5-3 .6-4.9 2.5-5.5 5.5-.6-3-2.5-4.9-5.5-5.5 3-.6 4.9-2.5 5.5-5.5Z" strokeWidth={2} />
      <path d="M18.5 15.5c.3 1.4 1.1 2.2 2.5 2.5-1.4.3-2.2 1.1-2.5 2.5-.3-1.4-1.1-2.2-2.5-2.5 1.4-.3 2.2-1.1 2.5-2.5Z" strokeWidth={1.4} />
    </svg>
  )
}

// Warning triangle - heads-up nudges.
export function WarningIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 4.5 21 19H3L12 4.5Z" strokeWidth={2.1} />
      <path d="M12 10v4M12 16.5h.01" strokeWidth={2.2} />
    </svg>
  )
}

// Two eyes - "watching for" / being watched.
export function EyesIcon(props) {
  return (
    <svg {...base} {...props}>
      <ellipse cx="8" cy="12" rx="3" ry="3.6" strokeWidth={1.9} />
      <ellipse cx="16" cy="12" rx="3" ry="3.6" strokeWidth={1.9} />
      <circle cx="8" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="16" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

// Set-square ruler - staking-plan math.
export function RulerIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 20 20 4" strokeWidth={2.1} />
      <path d="M4 20 20 20 20 4" strokeWidth={1.8} />
      <path d="M13 20v-3M16 20v-3M19 20v-3" strokeWidth={1.3} />
    </svg>
  )
}

// Rising line - stats/trend.
export function TrendUpIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 16 9.5 10.5 13.5 14.5 20 6" strokeWidth={2.1} />
      <path d="M15 6h5v5" strokeWidth={1.5} />
    </svg>
  )
}

// Falling line - the opposite trend.
export function TrendDownIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 8 9.5 13.5 13.5 9.5 20 18" strokeWidth={2.1} />
      <path d="M15 18h5v-5" strokeWidth={1.5} />
    </svg>
  )
}

// Megaphone - trending/announcements.
export function MegaphoneIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 10.5v3a1.5 1.5 0 0 0 1.5 1.5H7l8 4V5l-8 4H5.5A1.5 1.5 0 0 0 4 10.5Z" strokeWidth={2} />
      <path d="M18.5 9.5a4 4 0 0 1 0 5" strokeWidth={1.5} />
    </svg>
  )
}

// Pushpin - tags.
export function PinIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M9 4h6l-1 6 4 4h-6v6l-1 1-1-1v-6H5l4-4-1-6Z" strokeWidth={2} />
    </svg>
  )
}

// Curved share arrow.
export function ShareIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M8 12a5.5 5.5 0 0 1 9-4.3" strokeWidth={1.7} />
      <path d="M13.5 4.5 17 7.7l-3.5 3.2" strokeWidth={1.7} />
      <path d="M8 12v6.5A1.5 1.5 0 0 0 9.5 20h8a1.5 1.5 0 0 0 1.5-1.5V13" strokeWidth={2.1} />
    </svg>
  )
}

// Box with an outbound arrow - sharp-money / export.
export function ExportIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3v11" strokeWidth={1.8} />
      <path d="M8 7l4-4 4 4" strokeWidth={1.6} />
      <path d="M5 14v4.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V14" strokeWidth={2.1} />
    </svg>
  )
}

// Confetti burst - welcome/celebration moments.
export function CelebrateIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 12 5 20" strokeWidth={1.9} />
      <path d="M9 5.5l.7 1.9M14.5 4l-.4 2M18 8.5l-1.9.7M19 13l-2 .3M6 10l1.7 1" strokeWidth={1.3} />
      <circle cx="16.5" cy="16.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

// Bell - price/odds alerts.
export function BellIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M6 10.5a6 6 0 0 1 12 0c0 3.2 1.1 4.7 1.5 5.2H4.5S6 14.3 6 10.5Z" strokeWidth={2.1} />
      <path d="M10.2 19a1.9 1.9 0 0 0 3.6 0" strokeWidth={1.4} />
    </svg>
  )
}

// Diamond - best-value edges.
export function DiamondIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M7 4h10l4 5.5L12 21 3 9.5 7 4Z" strokeWidth={2.1} />
      <path d="M3 9.5h18M9.5 4 8 9.5 12 21M14.5 4 16 9.5 12 21" strokeWidth={1.3} />
    </svg>
  )
}

// Film reel - watch highlights.
export function FilmIcon(props) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="5" width="17" height="14" rx="1.8" strokeWidth={2.1} />
      <path d="M8 5v14M16 5v14M3.5 9.5H8M16 9.5h4.5M3.5 14.5H8M16 14.5h4.5" strokeWidth={1.3} />
    </svg>
  )
}

// TV screen - watch live.
export function TvIcon(props) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="6.5" width="18" height="12.5" rx="1.8" strokeWidth={2.1} />
      <path d="M8 3.5 12 6.5 16 3.5" strokeWidth={1.6} />
    </svg>
  )
}

// Outbound arrow - external profile/social links.
export function ArrowUpRightIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M7 17 17 7" strokeWidth={2.1} />
      <path d="M9 7h8v8" strokeWidth={1.7} />
    </svg>
  )
}

// Coin stack - money milestones (profit, stake, biggest win).
export function MoneyIcon(props) {
  return (
    <svg {...base} {...props}>
      <ellipse cx="12" cy="6" rx="7" ry="2.8" strokeWidth={2} />
      <path d="M5 6v5.5c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V6" strokeWidth={1.6} />
      <path d="M5 11.5V17c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-5.5" strokeWidth={1.6} />
    </svg>
  )
}

// Horse head - underdog racing win.
export function HorseIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M6 20v-5.5c0-4 2.5-7 6-8.5 1.5-.6 2.5-1.8 2.5-3.5 1.5 1 2.5 2.7 2.5 4.5 0 1.8-.9 2.8-2 3.5l2 1.5-2 1.5.5 3-2.5 1v2.5" strokeWidth={2} />
      <circle cx="14.5" cy="6" r=".8" fill="currentColor" stroke="none" />
    </svg>
  )
}

// Handshake - referrals brought in.
export function HandshakeIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M2.5 12.5 6 9l3 2 3-2 3 2 3.5-2.5" strokeWidth={1.9} />
      <path d="M9 11l3.5 3.5a1.6 1.6 0 0 1-2.3 2.3L7 13.5" strokeWidth={1.7} />
      <path d="M12.5 14.5 14 16a1.6 1.6 0 0 0 2.3-2.3" strokeWidth={1.7} />
      <path d="M2.5 12.5 5 17M21.5 12.5 19 17" strokeWidth={1.6} />
    </svg>
  )
}

// Bar chart - stats/breakdowns.
export function ChartBarIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 20V10M10 20V4M16 20v-7M4 20h16" strokeWidth={2} />
    </svg>
  )
}

// Shield - discipline/restraint streaks.
export function ShieldIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3.5 19 6.5v5c0 5-3 8-7 9.5-4-1.5-7-4.5-7-9.5v-5Z" strokeWidth={2.1} />
    </svg>
  )
}

// Check in a rosette - perfect record / verified reliable badge.
export function BadgeCheckIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8.5" strokeWidth={2.1} />
      <path d="M8.5 12.3l2.3 2.3 4.7-4.9" strokeWidth={1.7} />
    </svg>
  )
}

// Open book - bets logged milestones.
export function BookIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 5.5c-1.5-1-4-1.5-6.5-1v13c2.5-.5 5 0 6.5 1" strokeWidth={1.9} />
      <path d="M12 5.5c1.5-1 4-1.5 6.5-1v13c-2.5-.5-5 0-6.5 1v-13Z" strokeWidth={1.9} />
    </svg>
  )
}

// Medal - top-performer callouts.
export function MedalIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M8.5 3.5 11 9M15.5 3.5 13 9" strokeWidth={1.6} />
      <circle cx="12" cy="14.5" r="6" strokeWidth={2.1} />
      <path d="M12 11.5v6M9.5 14.5h5" strokeWidth={1.4} />
    </svg>
  )
}

// Heartbeat line - betting-style volatility.
export function PulseIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M3 12h4l2-6 4 12 2-6h6" strokeWidth={2.1} />
    </svg>
  )
}

// Ballot box - crowd-vote calibration.
export function BallotIcon(props) {
  return (
    <svg {...base} {...props}>
      <rect x="4" y="9" width="16" height="11" rx="1.5" strokeWidth={2.1} />
      <path d="M9 9V6a3 3 0 0 1 6 0v3" strokeWidth={1.5} />
      <path d="M12 12.5v4M9.5 15h5" strokeWidth={1.5} />
    </svg>
  )
}

// Broken heart - agony-column near-misses.
export function BrokenHeartIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 20s-7.5-4.5-9-10.5C2.2 5.8 4.3 3.5 7 3.5c2 0 3.5 1.2 4 2.5l-1.8 3.2L11.5 12 9.7 15l2.3 5Z" strokeWidth={1.9} />
      <path d="M12 6c.5-1.3 2-2.5 4-2.5 2.7 0 4.8 2.3 4 5.9-.6 2.7-2.6 5-4.6 6.8" strokeWidth={1.9} />
    </svg>
  )
}

// Football - the "football tip" post tag.
export function FootballIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8.5" strokeWidth={2.1} />
      <path d="M12 8.5 15.5 11l-1.3 4h-4.4L8.5 11 12 8.5Z" strokeWidth={1.4} />
      <path d="M12 3.5V6M12 18v2.5M4.5 8.5l2 1.3M17.5 8.5l-2 1.3M4.5 15.5l2-1.3M17.5 15.5l-2-1.3" strokeWidth={1.2} />
    </svg>
  )
}

// Padlock - locks/limits/premium gates.
export function LockIcon(props) {
  return (
    <svg {...base} {...props}>
      <rect x="5" y="11" width="14" height="9.5" rx="1.8" strokeWidth={2.1} />
      <path d="M8 11V7.5a4 4 0 0 1 8 0V11" strokeWidth={1.7} />
    </svg>
  )
}

// Crown - the top referral tier.
export function CrownIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 18h16M4.5 18l-1-9 5 3.5L12 6l3.5 6.5 5-3.5-1 9" strokeWidth={2} />
    </svg>
  )
}

// Globe - multi-sport / worldwide.
export function GlobeIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8.5" strokeWidth={2.1} />
      <path d="M3.5 12h17M12 3.5c2.5 2.3 4 5.3 4 8.5s-1.5 6.2-4 8.5c-2.5-2.3-4-5.3-4-8.5s1.5-6.2 4-8.5Z" strokeWidth={1.4} />
    </svg>
  )
}

// Pencil - quick-log a suggested leg.
export function PencilIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 20 4.8 16 15.5 5.3a1.8 1.8 0 0 1 2.5 0l.7.7a1.8 1.8 0 0 1 0 2.5L8 19.2 4 20Z" strokeWidth={1.9} />
      <path d="M13.5 7.5l3 3" strokeWidth={1.4} />
    </svg>
  )
}

// Plain checkmark - won/settled-good status. Kept as a plain glyph, not a
// betting shape - status icons need to read instantly at a glance, and a
// checkmark already does that.
export function CheckIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4.5 12.5 9.5 17.5 19.5 6.5" strokeWidth={2.3} />
    </svg>
  )
}

// X - lost/settled-bad status.
export function XIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M5 5 19 19M19 5 5 19" strokeWidth={2.3} />
    </svg>
  )
}

// Dash - void/no-result status.
export function MinusIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M5 12h14" strokeWidth={2.3} />
    </svg>
  )
}

// Download into a tray - install to home screen.
export function DownloadIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3v12M7.5 10.5 12 15l4.5-4.5" strokeWidth={1.8} />
      <path d="M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16" strokeWidth={2.1} />
    </svg>
  )
}

// Stopwatch - time-based reminders (reality check).
export function StopwatchIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="13" r="8" strokeWidth={2.1} />
      <path d="M12 13V9M9.5 3.5h5M12 3.5V5.5" strokeWidth={1.5} />
    </svg>
  )
}

// Clipboard - entering/tracking standings data.
export function ClipboardIcon(props) {
  return (
    <svg {...base} {...props}>
      <rect x="5" y="4.5" width="14" height="17" rx="1.8" strokeWidth={2.1} />
      <rect x="9" y="3" width="6" height="3" rx="1" strokeWidth={1.6} />
      <path d="M8.5 11h7M8.5 14.5h7M8.5 18h4.5" strokeWidth={1.3} />
    </svg>
  )
}
