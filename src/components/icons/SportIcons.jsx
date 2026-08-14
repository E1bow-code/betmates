// Same hand-drawn line-icon treatment as NavIcons.jsx, one per sport -
// replaces the emoji SPORT_ICON map in src/lib/sportsConfig.js was using.
// Deliberately abstract rather than literal (a few strokes suggesting a
// ball/bat/stick) since a detailed pictogram falls apart at the ~16-20px
// this renders at inline next to text - simple geometry reads cleanly at
// that size, a crowded one turns to mud.
const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round'
}

function Football(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 12V7.2M12 12 8.3 14.6M12 12l3.7 2.6" />
    </svg>
  )
}

function Racing(props) {
  return (
    <svg {...base} {...props}>
      <path d="M5 3v18" />
      <path d="M5 4h11l-2.3 3.3L16 10.5H5V4Z" />
      <rect x="7" y="5" width="1.8" height="1.8" fill="currentColor" stroke="none" />
      <rect x="10.6" y="5" width="1.8" height="1.8" fill="currentColor" stroke="none" />
      <rect x="8.8" y="7.6" width="1.8" height="1.6" fill="currentColor" stroke="none" />
      <rect x="12.4" y="7.6" width="1.6" height="1.6" fill="currentColor" stroke="none" />
    </svg>
  )
}

function Ufc(props) {
  return (
    <svg {...base} {...props}>
      <rect x="6" y="7.5" width="11" height="9" rx="4" />
      <path d="M9 7.5v3M12.5 7.5v3M16 7.5v3" />
    </svg>
  )
}

function Tennis(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="9.5" cy="8.5" r="5" />
      <path d="M9.5 13.5v6.5M7.2 17h4.6" />
      <circle cx="17.5" cy="16.5" r="1.8" fill="currentColor" stroke="none" />
    </svg>
  )
}

function Basketball(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3v18" />
      <path d="M5.6 5.6c2.8 3 2.8 9.8 0 12.8M18.4 5.6c-2.8 3-2.8 9.8 0 12.8" />
    </svg>
  )
}

function Hockey(props) {
  return (
    <svg {...base} {...props}>
      <path d="M17 4 8.5 18" />
      <path d="M8.5 18h5" />
      <ellipse cx="19" cy="19" rx="2.3" ry="1.3" fill="currentColor" stroke="none" />
    </svg>
  )
}

function Baseball(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M6.3 6.3c2.6 2.4 2.6 9 0 11.4M17.7 6.3c-2.6 2.4-2.6 9 0 11.4" />
    </svg>
  )
}

function Football2(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 12c0-3.2 4-7 8-7s8 3.8 8 7-4 7-8 7-8-3.8-8-7Z" />
      <path d="M8.2 12h7.6M10.3 10v4M12 10v4M13.7 10v4" />
    </svg>
  )
}

function Rugby(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 12c0-3.2 4-7 8-7s8 3.8 8 7-4 7-8 7-8-3.8-8-7Z" />
      <path d="M4.5 12h15" />
    </svg>
  )
}

function Cricket(props) {
  return (
    <svg {...base} {...props}>
      <rect x="-1.8" y="-1.3" width="3.6" height="11" rx="1.3" transform="translate(13 8) rotate(25)" />
      <path d="M9.5 15.3 7 18" />
      <circle cx="17.3" cy="6.5" r="1.7" fill="currentColor" stroke="none" />
    </svg>
  )
}

function Boxing(props) {
  return (
    <svg {...base} {...props}>
      <path d="M7 10.2a3 3 0 0 1 6 0v.8h1a3 3 0 0 1 3 3v1c0 2.5-2 4.5-4.5 4.5H10a4 4 0 0 1-4-4v-5.3Z" />
      <path d="M5 10.2a2 2 0 0 1 4 0v2.3" />
    </svg>
  )
}

// Fallback for anything not in the map below (matches the old '🎟️'
// default) - a ticket stub, tying into the receipt/betting-slip motif
// used elsewhere (src/lib/shareImage.js's recap card).
function Ticket(props) {
  return (
    <svg {...base} {...props}>
      <rect x="4" y="6" width="16" height="12" rx="2" />
      <path d="M12 6v12" strokeDasharray="2 2.5" />
    </svg>
  )
}

const SPORT_ICONS = {
  football: Football,
  racing: Racing,
  ufc: Ufc,
  tennis: Tennis,
  basketball: Basketball,
  hockey: Hockey,
  baseball: Baseball,
  nfl: Football2,
  rugbyLeague: Rugby,
  rugbyUnion: Rugby,
  cricket: Cricket,
  boxing: Boxing
}

export default function SportIcon({ sport, size = 16, className, ...rest }) {
  const Cmp = SPORT_ICONS[sport] ?? Ticket
  return <Cmp width={size} height={size} className={className ? `sport-icon-inline ${className}` : 'sport-icon-inline'} {...rest} />
}
