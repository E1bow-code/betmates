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

// Accepts either a decimal ("2.05") or fractional ("21/20") string and
// returns the decimal price, so free-text inputs (like the payout
// calculator) don't force a user to convert their own bookmaker's fraction
// display into decimal first. Returns null for anything unparseable rather
// than throwing, so callers can just treat it like an empty field.
export function parseOddsInput(input) {
  const trimmed = String(input ?? '').trim()
  if (!trimmed) return null
  // A real price is always > 1.0 decimal (evens = 2.0, and a fraction's
  // parts are both positive) - anything else is a typo, and letting it
  // through produces a "payout" below the stake in the calculator rather
  // than an empty field the user can see is wrong.
  if (trimmed.includes('/')) {
    const parts = trimmed.split('/')
    if (parts.length !== 2) return null
    const num = Number(parts[0])
    const den = Number(parts[1])
    if (!Number.isFinite(num) || !Number.isFinite(den)) return null
    if (num <= 0 || den <= 0) return null
    return 1 + num / den
  }
  const decimal = Number(trimmed)
  return Number.isFinite(decimal) && decimal > 1 ? decimal : null
}
