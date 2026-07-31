// Realistic mock odds response, shaped like what we expect a real odds API
// to return: races -> runners -> per-bookmaker prices, with best price precomputed.
// This lets the UI/data layer be built before an API is chosen (see src/api/oddsClient.js).

const BOOKMAKERS = ['Bet365', 'William Hill', 'Paddy Power', 'Sky Bet', 'Betfair', 'Ladbrokes']

function fractionToDecimal(fraction) {
  const [num, den] = fraction.split('/').map(Number)
  return Math.round((num / den + 1) * 100) / 100
}

function makeRunner(id, number, name, jockey, trainer, priceOptions) {
  const allOdds = priceOptions.map((price, i) => ({
    bookmaker: BOOKMAKERS[i % BOOKMAKERS.length],
    price,
    decimal: fractionToDecimal(price)
  }))
  const best = allOdds.reduce((a, b) => (b.decimal > a.decimal ? b : a))
  return {
    id,
    number,
    name,
    jockey,
    trainer,
    silkColor: ['#dc2626', '#2563eb', '#16a34a', '#eab308', '#9333ea', '#0891b2', '#ea580c', '#db2777'][number % 8],
    bestOdds: { price: best.price, decimal: best.decimal, bookmaker: best.bookmaker },
    allOdds: allOdds.sort((a, b) => b.decimal - a.decimal)
  }
}

function inHours(h) {
  const d = new Date()
  d.setMinutes(0, 0, 0)
  d.setHours(d.getHours() + h)
  return d.toISOString()
}

export const mockRaces = [
  {
    id: 'race_ascot_1430',
    course: 'Ascot',
    raceName: 'Summer Handicap',
    offTime: inHours(1),
    distance: '1m 2f',
    going: 'Good to Firm',
    raceClass: 'Class 2',
    runners: [
      makeRunner('r1', 1, 'Thunder Chaser', 'R. Moore', 'A. Balding', ['7/2', '3/1', '10/3', '3/1', '7/2', '4/1']),
      makeRunner('r2', 2, 'Silver Streak', 'F. Dettori', 'J. Gosden', ['9/2', '5/1', '9/2', '4/1', '5/1', '9/2']),
      makeRunner('r3', 3, 'Midnight Run', 'O. Murphy', 'C. Appleby', ['11/2', '6/1', '11/2', '13/2', '6/1', '11/2']),
      makeRunner('r4', 4, 'Golden Arrow', 'H. Doyle', 'W. Haggas', ['8/1', '15/2', '8/1', '9/1', '8/1', '15/2']),
      makeRunner('r5', 5, 'Emerald Isle', 'J. Fanning', 'M. Johnston', ['12/1', '10/1', '11/1', '12/1', '10/1', '12/1']),
      makeRunner('r6', 6, 'Storm Warning', 'T. Marquand', 'R. Varian', ['16/1', '14/1', '16/1', '18/1', '14/1', '16/1'])
    ]
  },
  {
    id: 'race_newmarket_1500',
    course: 'Newmarket',
    raceName: 'Rowley Mile Stakes',
    offTime: inHours(1.5),
    distance: '1m',
    going: 'Good',
    raceClass: 'Class 1',
    runners: [
      makeRunner('n1', 1, 'Desert King', 'F. Dettori', 'J. Gosden', ['5/2', '2/1', '9/4', '5/2', '2/1', '9/4']),
      makeRunner('n2', 2, 'Night Owl', 'R. Moore', 'A. O\'Brien', ['7/2', '3/1', '7/2', '4/1', '3/1', '7/2']),
      makeRunner('n3', 3, 'Fast Lane', 'O. Murphy', 'C. Appleby', ['6/1', '5/1', '11/2', '6/1', '5/1', '6/1']),
      makeRunner('n4', 4, 'Blue Horizon', 'W. Buick', 'C. Appleby', ['10/1', '9/1', '10/1', '11/1', '9/1', '10/1']),
      makeRunner('n5', 5, 'Rapid Fire', 'H. Doyle', 'W. Haggas', ['14/1', '12/1', '14/1', '16/1', '12/1', '14/1'])
    ]
  },
  {
    id: 'race_york_1600',
    course: 'York',
    raceName: 'Ebor Trial',
    offTime: inHours(2.5),
    distance: '1m 6f',
    going: 'Soft',
    raceClass: 'Class 3',
    runners: [
      makeRunner('y1', 1, 'Northern Light', 'J. Fanning', 'M. Johnston', ['4/1', '7/2', '4/1', '9/2', '7/2', '4/1']),
      makeRunner('y2', 2, 'Copper Beech', 'T. Marquand', 'R. Varian', ['5/1', '9/2', '5/1', '11/2', '9/2', '5/1']),
      makeRunner('y3', 3, 'Iron Will', 'R. Moore', 'A. Balding', ['13/2', '6/1', '13/2', '7/1', '6/1', '13/2']),
      makeRunner('y4', 4, 'Highland Reel II', 'O. Murphy', 'C. Appleby', ['9/1', '8/1', '9/1', '10/1', '8/1', '9/1']),
      makeRunner('y5', 5, 'Autumn Gold', 'F. Dettori', 'J. Gosden', ['12/1', '11/1', '12/1', '14/1', '11/1', '12/1']),
      makeRunner('y6', 6, 'Whispering Pine', 'H. Doyle', 'W. Haggas', ['20/1', '16/1', '20/1', '25/1', '16/1', '20/1']),
      makeRunner('y7', 7, 'Bold Venture', 'W. Buick', 'C. Appleby', ['25/1', '20/1', '25/1', '33/1', '20/1', '25/1'])
    ]
  },
  {
    id: 'race_goodwood_1730',
    course: 'Goodwood',
    raceName: 'Sussex Downs Handicap',
    offTime: inHours(4),
    distance: '7f',
    going: 'Good to Firm',
    raceClass: 'Class 4',
    runners: [
      makeRunner('g1', 1, 'Cliffside', 'H. Doyle', 'W. Haggas', ['3/1', '7/2', '3/1', '10/3', '7/2', '3/1']),
      makeRunner('g2', 2, 'Meadow Lark', 'J. Fanning', 'M. Johnston', ['9/2', '4/1', '9/2', '5/1', '4/1', '9/2']),
      makeRunner('g3', 3, 'Solar Flare II', 'T. Marquand', 'R. Varian', ['7/1', '6/1', '7/1', '15/2', '6/1', '7/1']),
      makeRunner('g4', 4, 'Prince of Tides', 'R. Moore', 'A. O\'Brien', ['10/1', '9/1', '10/1', '11/1', '9/1', '10/1'])
    ]
  }
]

export function getMockRaces() {
  return structuredClone(mockRaces).sort((a, b) => new Date(a.offTime) - new Date(b.offTime))
}

export function getMockRace(id) {
  const race = mockRaces.find((r) => r.id === id)
  return race ? structuredClone(race) : null
}
