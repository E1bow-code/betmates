// Best-effort extraction from a photographed bet slip's raw OCR text. Real
// slips vary wildly by bookmaker and layout, so this only ever guesses the
// two fields that are reliably printed in a recognisable shape - a price
// and a stake - and leaves event/market/selection for the user to read off
// rawText and type in themselves (see ManualEntrySheet.jsx). Never throws:
// worst case every guess is null and the form just starts blank, same as
// opening it directly.

const FRACTION_RE = /\b(\d{1,3})\s*\/\s*(\d{1,3})\b/g
// Excludes a number immediately preceded by "£" so a stake like "£10.00"
// isn't also guessed as the odds.
const DECIMAL_ODDS_RE = /(?<!£)(?<!£\s)\b([1-9]\d{0,2}\.\d{1,2})\b/
const STAKE_RE = /(?:stake|bet)\D{0,6}£?\s*(\d+(?:\.\d{1,2})?)/i
const CURRENCY_RE = /£\s*(\d+(?:\.\d{1,2})?)/

export function parseSlipText(rawText) {
  const text = String(rawText ?? '')
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  // A racing slip's printed date ("Placed: 09/08/2026 14:32") and an
  // each-way term ("1/4 odds, 3 places") both match the same N/N shape as
  // a real fractional price, and the date usually sits above the price on
  // the slip - so taking the first match blindly was picking up "09/08"
  // (-> a nonsense "2.13") instead of the actual "5/2" further down. Walk
  // every candidate and skip the ones a real price fraction never looks
  // like: a third "/YY" segment right after it (a date), the word "odds"
  // right after it (an each-way term), or a date/time word right before it.
  let odds = null
  for (const fractionMatch of text.matchAll(FRACTION_RE)) {
    const after = text.slice(fractionMatch.index + fractionMatch[0].length, fractionMatch.index + fractionMatch[0].length + 8)
    const before = text.slice(Math.max(0, fractionMatch.index - 15), fractionMatch.index)
    if (/^\s*\/\s*\d/.test(after)) continue
    if (/^\s*odds\b/i.test(after)) continue
    if (/(placed|date|time)\s*:?\s*$/i.test(before)) continue
    const num = Number(fractionMatch[1])
    const den = Number(fractionMatch[2])
    if (num > 0 && den > 0) {
      odds = Math.round((1 + num / den) * 100) / 100
      break
    }
  }
  if (odds === null) {
    const decimalMatch = text.match(DECIMAL_ODDS_RE)
    if (decimalMatch && Number(decimalMatch[1]) > 1) odds = Number(decimalMatch[1])
  }

  let stake = null
  const stakeMatch = text.match(STAKE_RE)
  if (stakeMatch) stake = Number(stakeMatch[1])
  else {
    const currencyMatch = text.match(CURRENCY_RE)
    if (currencyMatch) stake = Number(currencyMatch[1])
  }

  return { odds, stake, lines }
}
