// The three actions that turn a brand-new signup into an activated BetMates
// user: log a bet (they see the tracker fill), join or start a group (the
// social half switches on), and follow a mate (the feed stops being empty).
// Kept as a pure function so the checklist card can be screenshot-tested and
// the "all done" transition covered without a backend. Order is deliberate:
// logging a bet is the zero-friction first win, group is the big unlock, and
// following is the lightest-touch step people skip if it's asked too early.
export function computeOnboardingSteps({ hasBet, inGroup, followsSomeone } = {}) {
  const steps = [
    {
      key: 'bet',
      done: !!hasBet,
      title: 'Log your first bet',
      body: 'Track a wager and watch your P&L and streaks come to life.',
      cta: 'Add a bet'
    },
    {
      key: 'group',
      done: !!inGroup,
      title: 'Join or start a group',
      body: 'Compare slips with your mates and settle it on a leaderboard.',
      cta: 'Find a group'
    },
    {
      key: 'follow',
      done: !!followsSomeone,
      title: 'Follow a mate',
      body: 'Fill your feed with the picks of people you actually bet against.',
      cta: 'Browse people'
    }
  ]
  const doneCount = steps.filter((s) => s.done).length
  return {
    steps,
    doneCount,
    total: steps.length,
    complete: doneCount === steps.length
  }
}
