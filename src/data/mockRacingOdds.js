// Mock horse racing odds, same shape family as src/data/mockFootballOdds.js
// so the Odds tab can render both sports through one adapter pattern.
// No live racing provider is wired up yet - see the note in
// netlify/functions/racing.js and Section 3/8 of the brief (Racing API
// access was lost; Betfair Exchange / Racing Post / RapidAPI are the
// options to evaluate next).

import { BOOKMAKERS } from '../lib/bookmakers.js'

function fractionToDecimal(fraction) {
  const [num, den] = fraction.split('/').map(Number)
  return Math.round((num / den + 1) * 100) / 100
}

function makeRunner(id, number, name, jockey, trainer, priceOptions, form) {
  const allOdds = priceOptions.map((price, i) => ({
    bookmaker: BOOKMAKERS[i % BOOKMAKERS.length],
    price,
    decimal: fractionToDecimal(price)
  }))
  const bestOdds = allOdds.reduce((a, b) => (b.decimal > a.decimal ? b : a))
  return {
    id,
    number,
    name,
    jockey,
    trainer,
    silkColor: ['#dc2626', '#2563eb', '#16a34a', '#eab308', '#9333ea', '#0891b2', '#ea580c', '#db2777'][number % 8],
    allOdds: allOdds.sort((a, b) => b.decimal - a.decimal),
    bestOdds,
    // Same shape netlify/functions/racing.js reshapes real theracingapi
    // runners into - keeps RaceDetailPage's form section demoable with
    // zero keys configured, per this app's "degrade, don't crash" rule.
    form: form?.form ?? null,
    officialRating: form?.officialRating ?? null,
    racingPostRating: form?.racingPostRating ?? null,
    daysSinceLastRun: form?.daysSinceLastRun ?? null,
    age: form?.age ?? null,
    weightLbs: form?.weightLbs ?? null,
    draw: form?.draw ?? String(number),
    headgear: form?.headgear ?? null,
    spotlight: form?.spotlight ?? null
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
      makeRunner('r1', 1, 'Thunder Chaser', 'R. Moore', 'A. Balding', ['7/2', '3/1', '10/3', '3/1', '7/2', '4/1', '3/1', '7/2', '4/1', '3/1'], {
        form: '211-32', officialRating: '96', racingPostRating: '98', daysSinceLastRun: '21', age: '5', weightLbs: '133', headgear: null,
        spotlight: 'Won this race 12 months ago off a similar mark and the form has worked out well since - the one to beat again.'
      }),
      makeRunner('r2', 2, 'Silver Streak', 'F. Dettori', 'J. Gosden', ['9/2', '5/1', '9/2', '4/1', '5/1', '9/2', '5/1', '9/2', '4/1', '5/1'], {
        form: '1-2143', officialRating: '93', racingPostRating: '95', daysSinceLastRun: '14', age: '4', weightLbs: '130', headgear: 'p',
        spotlight: 'Cheekpieces added for the first time - has been knocking on the door in this grade all season.'
      }),
      makeRunner('r3', 3, 'Midnight Run', 'O. Murphy', 'C. Appleby', ['11/2', '6/1', '11/2', '13/2', '6/1', '11/2', '6/1', '13/2', '6/1', '11/2'], {
        form: '4-5121', officialRating: '90', racingPostRating: '91', daysSinceLastRun: '28', age: '6', weightLbs: '128', headgear: null, spotlight: null
      }),
      makeRunner('r4', 4, 'Golden Arrow', 'H. Doyle', 'W. Haggas', ['8/1', '15/2', '8/1', '9/1', '8/1', '15/2', '9/1', '8/1', '15/2', '8/1'], {
        form: '635-42', officialRating: '87', racingPostRating: '88', daysSinceLastRun: '35', age: '4', weightLbs: '126', headgear: 'b', spotlight: null
      }),
      makeRunner('r5', 5, 'Emerald Isle', 'J. Fanning', 'M. Johnston', ['12/1', '10/1', '11/1', '12/1', '10/1', '12/1', '10/1', '11/1', '12/1', '10/1'], {
        form: '07-654', officialRating: '82', racingPostRating: '83', daysSinceLastRun: '49', age: '7', weightLbs: '122', headgear: null, spotlight: null
      }),
      makeRunner('r6', 6, 'Storm Warning', 'T. Marquand', 'R. Varian', ['16/1', '14/1', '16/1', '18/1', '14/1', '16/1', '14/1', '18/1', '14/1', '16/1'], {
        form: 'P-8790', officialRating: '78', racingPostRating: null, daysSinceLastRun: '63', age: '5', weightLbs: '120', headgear: null, spotlight: null
      })
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
      makeRunner('n1', 1, 'Desert King', 'F. Dettori', 'J. Gosden', ['5/2', '2/1', '9/4', '5/2', '2/1', '9/4', '2/1', '5/2', '2/1', '9/4'], {
        form: '1-11', officialRating: '108', racingPostRating: '111', daysSinceLastRun: '28', age: '3', weightLbs: '126', headgear: null,
        spotlight: 'Unbeaten in three starts and stepping up in trip for the first time - looks a serious Group horse in the making.'
      }),
      makeRunner('n2', 2, "Night Owl", 'R. Moore', "A. O'Brien", ['7/2', '3/1', '7/2', '4/1', '3/1', '7/2', '3/1', '4/1', '3/1', '7/2'], {
        form: '2-123', officialRating: '104', racingPostRating: '106', daysSinceLastRun: '21', age: '3', weightLbs: '126', headgear: null, spotlight: null
      }),
      makeRunner('n3', 3, 'Fast Lane', 'O. Murphy', 'C. Appleby', ['6/1', '5/1', '11/2', '6/1', '5/1', '6/1', '5/1', '11/2', '6/1', '5/1'], {
        form: '31-42', officialRating: '99', racingPostRating: '100', daysSinceLastRun: '35', age: '4', weightLbs: '129', headgear: 'v', spotlight: null
      }),
      makeRunner('n4', 4, 'Blue Horizon', 'W. Buick', 'C. Appleby', ['10/1', '9/1', '10/1', '11/1', '9/1', '10/1', '9/1', '11/1', '9/1', '10/1'], {
        form: '54-361', officialRating: '95', racingPostRating: '96', daysSinceLastRun: '18', age: '4', weightLbs: '127', headgear: null, spotlight: null
      }),
      makeRunner('n5', 5, 'Rapid Fire', 'H. Doyle', 'W. Haggas', ['14/1', '12/1', '14/1', '16/1', '12/1', '14/1', '12/1', '16/1', '12/1', '14/1'], {
        form: '807-65', officialRating: '89', racingPostRating: null, daysSinceLastRun: '56', age: '5', weightLbs: '124', headgear: 'p', spotlight: null
      })
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
      makeRunner('y1', 1, 'Northern Light', 'J. Fanning', 'M. Johnston', ['4/1', '7/2', '4/1', '9/2', '7/2', '4/1', '7/2', '9/2', '7/2', '4/1'], {
        form: '2-113', officialRating: '92', racingPostRating: '94', daysSinceLastRun: '24', age: '4', weightLbs: '131', headgear: null,
        spotlight: 'Stays this longer trip well on pedigree and has been progressive all summer - open to more improvement.'
      }),
      makeRunner('y2', 2, 'Copper Beech', 'T. Marquand', 'R. Varian', ['5/1', '9/2', '5/1', '11/2', '9/2', '5/1', '9/2', '11/2', '9/2', '5/1'], {
        form: '31-24', officialRating: '89', racingPostRating: '90', daysSinceLastRun: '17', age: '5', weightLbs: '129', headgear: null, spotlight: null
      }),
      makeRunner('y3', 3, 'Iron Will', 'R. Moore', 'A. Balding', ['13/2', '6/1', '13/2', '7/1', '6/1', '13/2', '6/1', '7/1', '6/1', '13/2'], {
        form: '4521-3', officialRating: '86', racingPostRating: '87', daysSinceLastRun: '42', age: '6', weightLbs: '127', headgear: 'b', spotlight: null
      }),
      makeRunner('y4', 4, 'Highland Reel II', 'O. Murphy', 'C. Appleby', ['9/1', '8/1', '9/1', '10/1', '8/1', '9/1', '8/1', '10/1', '8/1', '9/1'], {
        form: '65-231', officialRating: '84', racingPostRating: '85', daysSinceLastRun: '30', age: '4', weightLbs: '125', headgear: null, spotlight: null
      }),
      makeRunner('y5', 5, 'Autumn Gold', 'F. Dettori', 'J. Gosden', ['12/1', '11/1', '12/1', '14/1', '11/1', '12/1', '11/1', '14/1', '11/1', '12/1'], {
        form: '7-4560', officialRating: '80', racingPostRating: null, daysSinceLastRun: '70', age: '7', weightLbs: '122', headgear: null, spotlight: null
      }),
      makeRunner('y6', 6, 'Whispering Pine', 'H. Doyle', 'W. Haggas', ['20/1', '16/1', '20/1', '25/1', '16/1', '20/1', '16/1', '25/1', '16/1', '20/1'], {
        form: '09P-8', officialRating: '75', racingPostRating: null, daysSinceLastRun: '91', age: '8', weightLbs: '118', headgear: 'p', spotlight: null
      }),
      makeRunner('y7', 7, 'Bold Venture', 'W. Buick', 'C. Appleby', ['25/1', '20/1', '25/1', '33/1', '20/1', '25/1', '20/1', '33/1', '20/1', '25/1'], {
        form: null, officialRating: null, racingPostRating: null, daysSinceLastRun: null, age: '3', weightLbs: '124', headgear: null,
        spotlight: 'Debutant with a solid homework reputation - the market alone is the best guide first time out.'
      })
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
      makeRunner('g1', 1, 'Cliffside', 'H. Doyle', 'W. Haggas', ['3/1', '7/2', '3/1', '10/3', '7/2', '3/1', '7/2', '10/3', '7/2', '3/1'], {
        form: '1-121', officialRating: '91', racingPostRating: '93', daysSinceLastRun: '16', age: '4', weightLbs: '130', headgear: null,
        spotlight: 'Two wins from three starts this season and race fit - the one they all have to beat.'
      }),
      makeRunner('g2', 2, 'Meadow Lark', 'J. Fanning', 'M. Johnston', ['9/2', '4/1', '9/2', '5/1', '4/1', '9/2', '4/1', '5/1', '4/1', '9/2'], {
        form: '2-312', officialRating: '87', racingPostRating: '88', daysSinceLastRun: '22', age: '5', weightLbs: '128', headgear: null, spotlight: null
      }),
      makeRunner('g3', 3, 'Solar Flare II', 'T. Marquand', 'R. Varian', ['7/1', '6/1', '7/1', '15/2', '6/1', '7/1', '6/1', '15/2', '6/1', '7/1'], {
        form: '54-231', officialRating: '83', racingPostRating: '84', daysSinceLastRun: '38', age: '6', weightLbs: '125', headgear: 'b', spotlight: null
      }),
      makeRunner('g4', 4, 'Prince of Tides', 'R. Moore', "A. O'Brien", ['10/1', '9/1', '10/1', '11/1', '9/1', '10/1', '9/1', '11/1', '9/1', '10/1'], {
        form: '6-8740', officialRating: '78', racingPostRating: null, daysSinceLastRun: '55', age: '7', weightLbs: '121', headgear: null, spotlight: null
      })
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
