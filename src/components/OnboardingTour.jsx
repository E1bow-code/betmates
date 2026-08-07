import { useState } from 'react'

// A brief, dismissible carousel shown once after sign-up (see App.jsx) -
// the app's grown deep enough (streaks, Achievements, Hall of Fame, a
// verified tipster board, an AI coach) that a new user landing on the Odds
// tab could easily never find any of it without a nudge. Deliberately a
// fixed set of slides, not a tooltip tour pointing at live UI elements - far
// simpler to build reliably across mobile and desktop layouts, and doesn't
// break if the nav changes shape. Kept to five slides so it's finished, not
// abandoned halfway.
const SLIDES = [
  {
    icon: '⚖️',
    title: 'Compare odds, spot the value',
    body: 'See the best price across every major UK bookmaker - and “Value on the board” flags where the market looks out of line before you bet.'
  },
  {
    icon: '👥',
    title: 'Settle scores with your mates',
    body: 'Post picks to a group, react, comment, and see who’s actually good at this.'
  },
  {
    icon: '🎯',
    title: 'Follow the sharpest tipsters',
    body: 'A leaderboard ranks posters by their real, locked-in ROI - not screenshots - so you can follow the ones who keep coming good.'
  },
  {
    icon: '🏆',
    title: 'Track bets, build streaks, chase records',
    body: 'Win rate, streaks and badges land right on your nav bar, and the Hall of Fame shows the biggest wins across everyone.'
  },
  {
    icon: '🧠',
    title: 'Get the Coach’s take',
    body: 'On the Insights tab, get an honest, plain-language read on your own betting habits - a mirror on your record, never a tip.'
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
