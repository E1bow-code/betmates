// Kelly criterion staking helper - the third staking-plan style alongside
// the existing flat/percent rules in stakingPlan.js, but genuinely different
// in shape: flat/percent are a single number set once in Account and reused
// for every bet, while Kelly is computed fresh per bet from the odds on offer
// and the user's OWN probability estimate for that specific outcome. BetMates
// never tips or predicts, so the probability is always something the user
// types in themselves - this function only does the arithmetic on it.
//
// f* = (p*d - 1) / (d - 1), where d is decimal odds and p is the user's own
// win-probability estimate (0-1). Negative f* means the price implies worse
// value than the user's own view, so the suggestion is 0, not a negative
// stake. `fraction` lets the caller apply fractional Kelly (half/quarter is
// standard practice to cut variance vs full Kelly) - defaults to 1 (full).
export function kellyStake({ bankroll, odds, probability, fraction = 1 }) {
  if (!(bankroll > 0) || !(odds > 1) || !(probability > 0 && probability < 1) || !(fraction > 0)) return null

  const b = odds - 1
  const edgeFraction = (probability * odds - 1) / b
  if (edgeFraction <= 0) return { stakeFraction: 0, stake: 0, edgePct: Math.round(edgeFraction * 1000) / 10 }

  const stakeFraction = edgeFraction * fraction
  const stake = Math.round(bankroll * stakeFraction * 100) / 100
  return { stakeFraction, stake, edgePct: Math.round(edgeFraction * 1000) / 10 }
}
