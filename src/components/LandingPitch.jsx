import { OddsIcon, TrackerIcon, SocialIcon } from './icons/NavIcons.jsx'

// Shown above the sign-up form for a first-time, logged-out visitor (see
// AuthPage.jsx - only in signup mode, never in signin, so a returning
// person clicking "Sign in" isn't made to scroll past a pitch they don't
// need). Every referral/share link in the app lands here, so this is the
// only place that ever explains what BetMates actually is before asking
// for an email address.
const FEATURES = [
  {
    Icon: OddsIcon,
    title: 'Every sport, one place',
    body: 'Football, racing, UFC, tennis and more, compared across every major UK bookmaker - with real links straight to the bet.'
  },
  {
    Icon: TrackerIcon,
    title: 'Your actual record',
    body: "P&L, ROI, win rate, streaks. Not vibes about who's good at picking winners - numbers."
  },
  {
    Icon: SocialIcon,
    title: 'Answer to your mates',
    body: "Group leaderboards, head-to-head, Hall of Fame. The receipts stay whether you're up or down."
  }
]

export default function LandingPitch({ onGetStarted }) {
  return (
    <div className="landing-pitch">
      <h2 className="landing-pitch-title">Odds are, you talk a big game.</h2>
      <p className="landing-pitch-lead">
        BetMates compares odds across every major bookmaker, logs what you'd have staked, and keeps the score with your mates - so
        "I called it" actually means something.
      </p>

      <div className="landing-features">
        {FEATURES.map(({ Icon, title, body }) => (
          <div className="landing-feature" key={title}>
            <Icon className="landing-feature-icon" width={22} height={22} />
            <div>
              <div className="landing-feature-title">{title}</div>
              <p className="landing-feature-body">{body}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="landing-trust">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3.5 5 6.5v5c0 4.5 3 7.7 7 9 4-1.3 7-4.5 7-9v-5l-7-3Z" />
          <path d="m9 12 2.2 2.2L15.5 10" />
        </svg>
        <span>BetMates never places a real bet or moves real money - just your own logged picks and honest odds.</span>
      </div>

      <button className="btn btn-primary landing-cta" type="button" onClick={onGetStarted}>
        Get started free ↓
      </button>
    </div>
  )
}
