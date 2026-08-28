import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useBetSlip } from '../context/BetSlipContext.jsx'
import * as dataStore from '../lib/dataStore.js'
import { computeOnboardingSteps } from '../utils/onboardingSteps.js'
import { CheckIcon, ArrowUpRightIcon } from './icons/Icons.jsx'

const DISMISSED_KEY = 'betmates:gettingStartedDismissed'
// Only a first-run aid: once someone's logged a handful of bets they've found
// their feet, and the solo-to-social nudging is handed off to HomeInviteNudge
// (which starts at 3 bets). Same boundary here so the two never stack.
const NEW_LIMIT = 3

// The first-run activation card on Home: the three actions that turn a fresh
// signup into an engaged user - log a bet, join a group, follow a mate. Shown
// only to genuinely new users with steps still open, and it disappears for
// good the moment all three are done (a small win) or the user dismisses it.
// `hasBet` comes free from Home's already-loaded entries; the group/follow
// signals are two cheap best-effort reads gated behind the newness check so
// established users never pay for them.
export default function GettingStartedChecklist({ user, entries }) {
  const { openSheet } = useBetSlip()
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === '1')
  const [signals, setSignals] = useState(null)

  const hasBet = !!entries && entries.length > 0
  const isNew = !!entries && entries.length < NEW_LIMIT

  useEffect(() => {
    if (dismissed || !isNew) return
    let live = true
    Promise.all([dataStore.listMyGroups(user.id), dataStore.listFollowing(user.id)])
      .then(([groups, following]) => live && setSignals({ inGroup: groups.length > 0, followsSomeone: following.length > 0 }))
      .catch(() => live && setSignals({ inGroup: false, followsSomeone: false }))
    return () => {
      live = false
    }
  }, [dismissed, isNew, user.id])

  // Hold space until we know all three signals, then only render while the
  // user is new, undismissed, and has something left to do.
  if (dismissed || !isNew || signals === null) return null
  const { steps, doneCount, total, complete } = computeOnboardingSteps({ hasBet, ...signals })
  if (complete) return null

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, '1')
    setDismissed(true)
  }

  return (
    <section className="getting-started" aria-label="Getting started">
      <header className="getting-started-head">
        <div>
          <p className="getting-started-title">Get set up</p>
          <p className="getting-started-progress">
            {doneCount} of {total} done
          </p>
        </div>
        <button className="getting-started-close" onClick={dismiss} aria-label="Dismiss getting started">
          Skip
        </button>
      </header>
      <div className="getting-started-bar" aria-hidden="true">
        <span style={{ width: `${(doneCount / total) * 100}%` }} />
      </div>
      <ol className="getting-started-steps">
        {steps.map((step) => (
          <li key={step.key} className={step.done ? 'getting-started-step done' : 'getting-started-step'}>
            <span className="getting-started-tick" aria-hidden="true">
              {step.done && <CheckIcon width={14} height={14} />}
            </span>
            <span className="getting-started-copy">
              <span className="getting-started-step-title">{step.title}</span>
              <span className="getting-started-step-body">{step.body}</span>
            </span>
            {!step.done &&
              (step.key === 'bet' ? (
                <button type="button" className="btn btn-primary btn-small getting-started-cta" onClick={openSheet}>
                  {step.cta}
                </button>
              ) : (
                <Link
                  to={step.key === 'group' ? '/groups' : '/explore'}
                  className="btn btn-ghost btn-small getting-started-cta"
                >
                  {step.cta} <ArrowUpRightIcon width={13} height={13} />
                </Link>
              ))}
          </li>
        ))}
      </ol>
    </section>
  )
}
