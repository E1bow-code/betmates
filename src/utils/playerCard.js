// Pure presentational helpers for ParticipantProfileSheet's card-front -
// nothing here fetches or invents data, it just formats what TheSportsDB
// already gave us (src/lib/playerProfile.js) a bit more like a real trading
// card: a short position badge instead of "Centre-Forward", a flag instead
// of a nationality string, an age instead of a birth date.

const POSITION_ABBR = {
  goalkeeper: 'GK',
  'centre-back': 'CB',
  'left-back': 'LB',
  'right-back': 'RB',
  defender: 'DEF',
  'defensive midfield': 'CDM',
  'central midfield': 'CM',
  'attacking midfield': 'CAM',
  midfielder: 'MID',
  'right winger': 'RW',
  'left winger': 'LW',
  winger: 'WNG',
  forward: 'FWD',
  striker: 'ST',
  'centre-forward': 'ST',
  fighter: 'FTR'
}

// Falls back to an initialism (first letter of each word, max 3) for any
// position TheSportsDB returns that isn't in the map above, rather than
// dropping the badge entirely.
export function abbreviatePosition(position) {
  if (!position) return null
  const key = position.trim().toLowerCase()
  if (POSITION_ABBR[key]) return POSITION_ABBR[key]
  const words = position.trim().split(/\s+/)
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase()
  return words
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 3)
}

// England/Scotland/Wales have no ISO 3166-1 country code (they're part of
// GB), but Unicode does define standalone tag-sequence flag emoji for them -
// worth special-casing given how much of this app's football data is
// British. Northern Ireland has no equivalent sequence, so it falls through
// to the plain GB flag below rather than showing nothing.
const SPECIAL_FLAGS = {
  england: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  scotland: '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  wales: '🏴󠁧󠁢󠁷󠁬󠁳󠁿'
}

// Common football/UFC/tennis/boxing nationalities, as returned by
// TheSportsDB's strNationality (a country name, not a code). Deliberately
// not exhaustive - an unmapped nationality just renders as text with no
// flag, same "render around whatever's there" rule as every other field on
// this profile.
const NAME_TO_ISO2 = {
  'northern ireland': 'GB',
  ireland: 'IE',
  france: 'FR',
  spain: 'ES',
  germany: 'DE',
  italy: 'IT',
  portugal: 'PT',
  netherlands: 'NL',
  belgium: 'BE',
  brazil: 'BR',
  argentina: 'AR',
  'united states': 'US',
  usa: 'US',
  canada: 'CA',
  mexico: 'MX',
  nigeria: 'NG',
  ghana: 'GH',
  senegal: 'SN',
  morocco: 'MA',
  egypt: 'EG',
  australia: 'AU',
  'new zealand': 'NZ',
  japan: 'JP',
  'south korea': 'KR',
  russia: 'RU',
  poland: 'PL',
  croatia: 'HR',
  serbia: 'RS',
  norway: 'NO',
  sweden: 'SE',
  denmark: 'DK',
  ukraine: 'UA',
  turkey: 'TR',
  greece: 'GR',
  switzerland: 'CH',
  austria: 'AT',
  iceland: 'IS',
  colombia: 'CO',
  uruguay: 'UY',
  chile: 'CL',
  peru: 'PE',
  ecuador: 'EC',
  venezuela: 'VE',
  jamaica: 'JM',
  'trinidad and tobago': 'TT',
  'south africa': 'ZA',
  cameroon: 'CM',
  'ivory coast': 'CI',
  "côte d'ivoire": 'CI',
  algeria: 'DZ',
  tunisia: 'TN',
  india: 'IN',
  pakistan: 'PK',
  china: 'CN',
  thailand: 'TH',
  philippines: 'PH',
  georgia: 'GE',
  kazakhstan: 'KZ',
  dagestan: 'RU'
}

function iso2ToFlagEmoji(code) {
  return [...code.toUpperCase()].map((c) => String.fromCodePoint(127397 + c.charCodeAt(0))).join('')
}

export function flagFor(nationality) {
  if (!nationality) return null
  const key = nationality.trim().toLowerCase()
  if (SPECIAL_FLAGS[key]) return SPECIAL_FLAGS[key]
  const iso2 = NAME_TO_ISO2[key]
  return iso2 ? iso2ToFlagEmoji(iso2) : null
}

// Whole years only, as of now - a stat tile has no room for "24 years,
// 3 months" and betting-relevant age never needs that precision.
export function ageFrom(dateBorn) {
  if (!dateBorn) return null
  const born = new Date(`${dateBorn}T00:00:00`)
  if (Number.isNaN(born.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - born.getFullYear()
  const hasHadBirthdayThisYear = now.getMonth() > born.getMonth() || (now.getMonth() === born.getMonth() && now.getDate() >= born.getDate())
  if (!hasHadBirthdayThisYear) age--
  return age
}
