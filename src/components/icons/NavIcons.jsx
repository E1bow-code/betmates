// Hand-drawn line icons for the main nav, replacing emoji - stroke uses
// currentColor rather than an emoji's fixed platform-rendered colour, so
// these actually respond to .bottom-nav-item.active's colour change (emoji
// never did) and to the light/dark theme swap for free.
const base = {
  viewBox: '0 0 24 24',
  width: 20,
  height: 20,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round'
}

// Simple roofline - home/dashboard.
export function HomeIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6 10v9.5h12V10" />
      <path d="M9.5 19.5v-6h5v6" />
    </svg>
  )
}

// Concentric rings - "best odds", closing in on a target price.
export function OddsIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

// Two people - group/social.
export function SocialIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="8.5" cy="8" r="2.8" />
      <path d="M3.3 19c0-3 2.3-5 5.2-5s5.2 2 5.2 5" />
      <circle cx="16.2" cy="9" r="2.2" />
      <path d="M14.7 14c2.4 0 5 1.5 5.5 5" />
    </svg>
  )
}

// Ascending bars - performance over time.
export function TrackerIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4.5 20V11" />
      <path d="M12 20V4" />
      <path d="M19.5 20v-6.5" />
    </svg>
  )
}

// Bell with a clapper - notifications.
export function AlertsIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M6 10.5a6 6 0 1 1 12 0c0 3.8 1.4 5.2 1.4 5.2H4.6S6 14.3 6 10.5Z" />
      <path d="M10.2 19a1.9 1.9 0 0 0 3.6 0" />
    </svg>
  )
}

// Single person - your own account, vs. Social's two.
export function AccountIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="8.3" r="3.4" />
      <path d="M4.8 20c0-4 3.2-6.3 7.2-6.3s7.2 2.3 7.2 6.3" />
    </svg>
  )
}
