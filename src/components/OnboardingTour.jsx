import { useState } from 'react'

// A brief, dismissible carousel shown once after sign-up (see App.jsx) -
// the app's grown deep enough (streaks, Achievements, Hall of Fame) that a
// new user landing on the Odds tab could easily never find any of it
// without a nudge. Deliberately a fixed set of slides, not a tooltip tour
// pointing at live UI elements - far simpler to build reliably across
// mobile and desktop layouts, and doesn't break if the nav changes shape.
const SLIDES = [
  {
    icon: '⚖️',
    title: 'Compare odds',
    body: 'See the best price across every major UK bookmaker before you bet - football, racing, UFC, and more.'
  },
  {
    icon: '👥',
    title: 'Settle scores with your mates',
    body: 'Post picks to a group, react, comment, and see who’s actually good at this.'
  },
  {
    icon: '🔥',
    title: 'Build a streak',
    body: 'Win rate, streaks, and badges - keep it going and it shows up right on your nav bar.'
  },
  {
    icon: '🏆',
    title: 'Chase the records',
    body: 'Unlock Achievements on Tracker, or check the Hall of Fame for the biggest wins across everyone.'
  }
]

export default function OnboardingTour({ onDone }) {
  const [i, setI] = useState(0)
  const slide = SLIDES[i]
  const last = i === SLIDES.length - 1

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-card">
        <div className="onboarding-icon">{slide.icon}</div>
        <h2 className="onboarding-title">{slide.title}</h2>
        <p className="onboarding-body">{slide.body}</p>
        <div className="onboarding-dots">
          {SLIDES.map((_, idx) => (
            <span key={idx} className={idx === i ? 'onboarding-dot active' : 'onboarding-dot'} />
          ))}
        </div>
        <div className="onboarding-actions">
          {!last && (
            <button className="btn btn-ghost" onClick={onDone}>
              Skip
            </button>
          )}
          <button className="btn btn-primary" onClick={() => (last ? onDone() : setI(i + 1))}>
            {last ? 'Get started' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}
