// Hand-drawn icons for the main nav, built as actual betting objects rather
// than generic app-icon equivalents (a roofline for home, two circles for
// people) - a betslip, poker chips, a receipt, a badge. Mixed stroke weight
// (bold outer silhouette, thinner inner ink) instead of one uniform width
// throughout, same reasoning the uniform-weight version used to justify
// itself with: a look this codebase's whole icon set had converged on,
// which is exactly what made it read as generic at a glance. Stroke still
// uses currentColor so these respond to .bottom-nav-item.active's colour
// change and the light/dark theme swap for free - emoji never did either.
const base = {
  viewBox: '0 0 24 24',
  width: 20,
  height: 20,
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round'
}

// Ticket stub - home/dashboard, the feed of picks.
export function HomeIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9.5H6a2 2 0 0 1-2-2V8Z" strokeWidth={2.2} />
      <path d="M9.2 7.2v9.1" strokeWidth={1.3} strokeDasharray="1.5 1.7" />
    </svg>
  )
}

// Price tag with an odds slash - "best odds", every sport in one place.
export function OddsIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M11.5 4H19a1 1 0 0 1 1 1v7.5a1 1 0 0 1-.3.7l-8 8a1 1 0 0 1-1.4 0l-6.5-6.5a1 1 0 0 1 0-1.4l8-8a1 1 0 0 1 .7-.3Z" strokeWidth={2.1} />
      <circle cx="16" cy="8" r="1.3" strokeWidth={1.3} />
      <path d="m9.5 15 5-5" strokeWidth={1.4} />
    </svg>
  )
}

// Two overlapping poker chips - group/mates.
export function SocialIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="9.5" cy="12" r="5.4" strokeWidth={2.2} />
      <circle cx="9.5" cy="12" r="2.6" strokeWidth={1.2} />
      <circle cx="16" cy="9" r="3.6" strokeWidth={1.6} />
    </svg>
  )
}

// Receipt with a torn edge and a tick - your settled record.
export function TrackerIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M5 5h14v12l-2.5 2.5L14 17l-2.5 2.5L9 17l-2.5 2.5L5 17Z" strokeWidth={2.2} />
      <path d="m8 10 2.5 2.5L15.5 8" strokeWidth={1.6} />
    </svg>
  )
}

// Bell with a clapper - notifications.
export function AlertsIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M6 10.5a6 6 0 1 1 12 0c0 3.8 1.4 5.2 1.4 5.2H4.6S6 14.3 6 10.5Z" strokeWidth={2.2} />
      <path d="M10.2 19a1.9 1.9 0 0 0 3.6 0" strokeWidth={1.4} />
    </svg>
  )
}

// Rosette badge with a tick - your own account, verified record.
export function AccountIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3.5 15.5 5v4.5c0 3.6-1.6 6-3.5 7-1.9-1-3.5-3.4-3.5-7V5Z" strokeWidth={2.2} />
      <path d="m9.7 9.3 1.6 1.7 3-3.4" strokeWidth={1.4} />
    </svg>
  )
}

// Plain cross - the bottom nav's central "log/post a bet" quick-add. Left
// as a plain cross rather than a betting shape on purpose - it's a momentary
// action button, not a destination, and a "+" reads instantly either way.
export function PlusIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 5v14" strokeWidth={2.4} />
      <path d="M5 12h14" strokeWidth={2.4} />
    </svg>
  )
}

// Three stacked lines, weight increasing top to bottom - a drawer/menu of
// everything else that doesn't fit BottomNav's six primary tabs
// (MoreMenu.jsx). Kept as a plain stack rather than a betting shape - this
// is a UI affordance, not a destination, and redrawing "more" as an object
// would cost recognizability for no gain.
export function MoreIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M8 7h8" strokeWidth={1.3} />
      <path d="M4 12h16" strokeWidth={1.8} />
      <path d="M4 17h16" strokeWidth={2.3} />
    </svg>
  )
}
