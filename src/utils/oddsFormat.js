// Converts a decimal price (2.05) to a fractional one (21/20). Real
// bookmaker odds are always exact ratios even when quoted decimal, so
// rounding to 2 decimal places before reducing by GCD reconstructs the
// original fraction exactly rather than approximating it.
export function toFractional(decimal) {
  const profit = decimal - 1
  if (!(profit > 0)) return '-'
  const denominator = 100
  let numerator = Math.round(profit * denominator)
  let den = denominator
  const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b))
  const g = gcd(numerator, den) || 1
  numerator /= g
  den /= g
  return `${numerator}/${den}`
}

// nativeFraction is an optional already-fractional price (racing's odds
// objects carry one, e.g. "5/2" - see src/data/mockRacingOdds.js) - using
// it instead of re-deriving one from the rounded decimal avoids any
// conversion drift for the one sport that's fractional-native.
export function formatOdds(decimal, format, nativeFraction) {
  if (decimal == null || Number.isNaN(decimal)) return '-'
  if (format === 'fractional') return nativeFraction ?? toFractional(decimal)
  return decimal.toFixed(2)
}
