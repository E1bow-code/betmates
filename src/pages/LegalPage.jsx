import { Link } from 'react-router-dom'

export default function LegalPage() {
  return (
    <div>
      <div className="topbar">
        <Link to="/" className="back">
          &larr; Back
        </Link>
        <h1>Terms, Privacy &amp; Responsible Gambling</h1>
      </div>

      <div className="legal-content">
        <section>
          <h2>What BetMates is</h2>
          <p>
            BetMates is an odds-comparison and social bet-sharing app. It is not a bookmaker: it does not accept
            stakes, place bets, or hold funds on your behalf. All bets are placed by you, directly with a licensed
            bookmaker of your choice.
          </p>
        </section>

        <section>
          <h2>Odds accuracy</h2>
          <p>
            Odds shown are sourced from third-party providers and may move or differ from the price your bookmaker
            actually offers by the time you place a bet. Always confirm the price on the bookmaker's site or app
            before staking.
          </p>
        </section>

        <section>
          <h2>Copy Bet</h2>
          <p>
            The "Copy Bet" button copies a bet-slip summary to your clipboard and, where supported, opens the
            named bookmaker's site or app. It never places or submits a bet automatically. You must review the
            selection and odds yourself and place the bet manually.
          </p>
        </section>

        <section>
          <h2>Age restriction</h2>
          <p>You must be 18 or older to create a BetMates account. We ask for your date of birth at sign-up to enforce this.</p>
        </section>

        <section>
          <h2>Responsible gambling</h2>
          <p>
            If gambling is no longer fun, help is available. Visit{' '}
            <a href="https://www.begambleaware.org" target="_blank" rel="noreferrer">
              BeGambleAware.org
            </a>{' '}
            or call the National Gambling Helpline free on 0808 8020 133.
          </p>
        </section>

        <section>
          <h2>Affiliate disclosure</h2>
          <p>
            Some links to bookmakers may be affiliate links. This does not affect the odds shown or which bookmaker
            appears as "best odds" - ranking is always by price.
          </p>
        </section>

        <section>
          <h2>Privacy Policy</h2>
          <p>
            <strong>What we collect.</strong> Creating an account collects your email address, display name, and
            date of birth (used only to confirm you're 18+, never shown to anyone else). Using the app can also
            store: bet picks you choose to post, messages you send in a group or direct message, a photo if you
            upload one as your avatar, and a push subscription if you turn notifications on.
          </p>
          <p>
            <strong>Why.</strong> Your email and password are used for sign-in. Bet picks and messages exist so the
            social features work at all - comparing picks with your mates is the point of the app. Push
            subscriptions exist so we can send the notifications you specifically turned on.
          </p>
          <p>
            <strong>Where it lives.</strong> Data is stored with Supabase, our database and authentication
            provider. We don't sell data, and there's no third-party analytics or ad tracking built into the app.
          </p>
          <p>
            <strong>On your device.</strong> A few preferences - theme, whether you've seen the onboarding tour,
            when you last checked a feed - are stored in your browser's local storage rather than our database.
            That's per-device and never synced or tracked centrally.
          </p>
          <p>
            <strong>Who can see what.</strong> Bets posted to a group are visible to that group's members only.
            Bets posted "to everyone" are public, visible to anyone including people without an account, via the
            public Feed and Hall of Fame. Direct messages are visible only to you and the other person in that
            conversation.
          </p>
          <p>
            <strong>Your controls.</strong> Edit your display name, bookmakers, and notification preferences any
            time in Account. Block or report another user's public posts from the Feed. Delete your account
            entirely - including your bets, comments, and messages - from Account &rarr; Danger zone. That's
            permanent and immediate.
          </p>
        </section>
      </div>
    </div>
  )
}
