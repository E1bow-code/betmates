import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

// Same plain section/h2/p structure as LegalPage.jsx (see .legal-content in
// style.css) - a practical "how do I..." companion to that page's legal
// text, for the questions the onboarding tour is too short to answer.
export default function HelpPage() {
  const { user } = useAuth()

  return (
    <div>
      <div className="topbar">
        <Link to={user ? '/account' : '/'} className="back">
          &larr; Back
        </Link>
        <h1>Help &amp; FAQ</h1>
      </div>

      <div className="legal-content">
        <section>
          <h2>What is BetMates?</h2>
          <p>
            BetMates compares odds across UK bookmakers and lets you share picks with mates - a leaderboard,
            comments, streaks, and bragging rights around bets you'd be placing anyway. It's built around
            accountability and comparison, not around getting you to bet more.
          </p>
        </section>

        <section>
          <h2>Why can't I actually place a bet here?</h2>
          <p>
            BetMates never holds your money or places a bet for you - it's not a bookmaker and never will be.
            When you tap a price, "Copy Bet" copies the selection to your clipboard and opens the bookmaker's own
            site or app so you place it there, with them, under their terms. See{' '}
            <Link to="/legal">Terms, Privacy &amp; Responsible Gambling</Link> for the full detail.
          </p>
        </section>

        <section>
          <h2>What does "each-way" mean?</h2>
          <p>
            Half your stake bets on the selection to win outright; the other half bets on it to finish in the
            paid places (2nd, 3rd, etc., depending on field size), at reduced odds. It's a racing-specific option
            offered on the Bet Builder whenever a race has enough runners for bookmakers to typically offer it.
          </p>
        </section>

        <section>
          <h2>What does "Void" mean on a settled bet?</h2>
          <p>
            A void bet is treated as if it never happened - your stake is excluded from profit/loss and win-rate
            math entirely, it isn't a win or a loss. This shows up for postponed/abandoned events and, in racing,
            for a selection that was withdrawn before the race went off.
          </p>
        </section>

        <section>
          <h2>How does auto-settlement work?</h2>
          <p>
            Once an event finishes, BetMates checks the result and marks your bet Won, Lost, or Void automatically
            - no need to do it yourself. This runs on a schedule in the background, and also instantly whenever you
            open Tracker. A small number of markets (goalscorer props, boxing, some racing edge cases) can't be read
            automatically and stay as "Mark result" for you to settle by hand.
          </p>
        </section>

        <section>
          <h2>What's the difference between Hall of Fame and my group's leaderboard?</h2>
          <p>
            A group leaderboard only ranks that group's members, on bets posted to that group. Hall of Fame is
            site-wide records - built only from picks posted "to everyone" (public), never from anything shared
            privately in a group.
          </p>
        </section>

        <section>
          <h2>Who can see my bets?</h2>
          <p>
            Depends how you post: to a specific group, only that group's members see it. "To everyone", it's
            public - visible on the Feed and countable toward Hall of Fame records, even to people without an
            account. Saved to Tracker only, nobody but you ever sees it.
          </p>
        </section>

        <section>
          <h2>How do I stop notifications?</h2>
          <p>
            Account &rarr; Notifications lets you turn off each type individually (bet posted, bet settled,
            kickoff reminders, odds moved). Turning off notifications in your browser/device settings works too,
            and stops everything at once.
          </p>
        </section>

        <section>
          <h2>Still stuck?</h2>
          <p>
            Most of the rest is covered in{' '}
            <Link to="/legal">Terms, Privacy &amp; Responsible Gambling</Link>. If gambling itself has stopped
            being fun, BeGambleAware.org and the National Gambling Helpline (0808 8020 133) are there to help,
            not just BetMates.
          </p>
        </section>
      </div>
    </div>
  )
}
