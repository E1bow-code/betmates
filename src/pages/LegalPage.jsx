import { Link } from 'react-router-dom'

export default function LegalPage() {
  return (
    <div>
      <div className="topbar">
        <Link to="/" className="back">
          &larr; Back
        </Link>
        <h1>Terms &amp; Responsible Gambling</h1>
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
      </div>
    </div>
  )
}
