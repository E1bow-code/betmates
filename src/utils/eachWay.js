// Standard UK bookmaker each-way terms by field size - the actual terms a
// given race pays vary by bookmaker and by handicap/non-handicap, but this
// is the common default most books fall back to, and close enough for an
// app that explicitly doesn't place real bets. Under 5 runners, each-way
// isn't normally offered at all (a "place" would just be a win).
export function getEachWayTerms(runnerCount) {
  if (runnerCount >= 16) return { places: 4, fraction: 0.25 }
  if (runnerCount >= 12) return { places: 3, fraction: 0.25 }
  if (runnerCount >= 8) return { places: 3, fraction: 0.2 }
  if (runnerCount >= 5) return { places: 2, fraction: 0.25 }
  return null
}

// Half the stake rides on the win part (pays at full odds, only if it
// wins), half rides on the place part (pays at odds shortened by
// `fraction`, if it finishes in the paid places - which winning also
// counts as). `result` is 'win' | 'place' | 'lose'.
export function computeEachWayReturn(stake, decimalOdds, terms, result) {
  const half = stake / 2
  const placeOdds = 1 + (decimalOdds - 1) * terms.fraction
  if (result === 'win') return half * decimalOdds + half * placeOdds
  if (result === 'place') return half * placeOdds
  return 0
}
