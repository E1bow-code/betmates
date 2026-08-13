// Powers BetBuilderSheet's inline Sport -> Event -> Market -> Selection
// picker (shown when the sheet opens with zero legs, i.e. triggered from
// Home's composer bar rather than by tapping a price on the Odds tab) - a
// cascading-dropdown way to add a pick without leaving the sheet or typing
// anything. Reuses the exact same list fetchers OddsListPage.jsx already
// calls per sport, so this adds zero new network calls beyond what
// browsing Odds already costs, and produces the same leg shape every
// FixtureDetailPage/RaceDetailPage/FightDetailPage/GenericEventDetailPage's
// own pick() already builds - toggleLeg() below doesn't know or care which
// path a leg came from.
import { fetchFixtures } from '../api/oddsClient.js'
import { fetchRaces } from '../api/racingClient.js'
import { fetchFights } from '../api/ufcClient.js'
import { fetchEvents } from '../api/genericSportsClient.js'
import { GENERIC_SPORTS, SPORT_LABEL } from './sportsConfig.js'
import { formatKickoff } from '../utils/format.js'

export const PICKER_SPORTS = ['football', 'racing', 'ufc', ...Object.keys(GENERIC_SPORTS)]
export { SPORT_LABEL }

// Same grouping OddsListPage.jsx's own groupByCompetition already does for
// the Odds tab's league-header sections - the Event dropdown was listing
// every fixture for a sport in one flat list (e.g. football mixes Premier
// League, Championship, and MLS together), so finding your own match meant
// scrolling past dozens of unrelated ones. Racing has no `competition`
// field (course/raceName instead) and isn't grouped this way, same carve-out
// as the Odds tab.
export function groupByCompetition(items) {
  const groups = new Map()
  for (const item of items) {
    const key = item.competition ?? 'Other'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(item)
  }
  return [...groups.entries()].map(([competition, items]) => ({ competition, items }))
}

export async function loadItemsForSport(sportKey) {
  if (sportKey === 'football') return fetchFixtures()
  if (sportKey === 'racing') return fetchRaces()
  if (sportKey === 'ufc') return fetchFights()
  return fetchEvents(sportKey)
}

function participantsFor(sportKey, item) {
  if (sportKey === 'football') return [item.homeTeam, item.awayTeam]
  if (sportKey === 'ufc') return [item.fighterA, item.fighterB]
  return [item.participantA, item.participantB]
}

// Cheap label for the Event dropdown's option text - doesn't touch
// markets/outcomes, so listing every fixture for a sport (the dropdown's
// full option list) stays fast even for a sport with a long fixture list.
export function labelFor(sportKey, item) {
  if (sportKey === 'racing') return `${item.course} ${formatKickoff(item.offTime)} · ${item.raceName}`
  const [a, b] = participantsFor(sportKey, item)
  return `${a} v ${b}`
}

// Full market/outcome/leg breakdown - only called for the one item the
// Event dropdown has selected, not the whole list. Reproduces the exact
// leg shape each sport's own detail-page pick() builds (see that
// function's comments for why each field exists - CLV matching,
// each-way math, bookmaker deep links) so a leg picked here is
// indistinguishable downstream from one picked by tapping a price on the
// Odds tab.
export function normalizeItem(sportKey, item) {
  if (sportKey === 'racing') {
    const label = labelFor(sportKey, item)
    return {
      id: item.id,
      label,
      kickoff: item.offTime,
      markets: [
        {
          key: 'win',
          label: 'Win',
          outcomes: item.runners.map((runner) => ({
            name: runner.name,
            best: runner.bestOdds,
            leg: {
              event: label,
              market: 'Win',
              selection: runner.name,
              odds: runner.bestOdds?.decimal,
              bookmaker: runner.bestOdds?.bookmaker,
              sport: 'racing',
              kickoff: item.offTime,
              runnerCount: item.runners.length,
              raceId: item.id,
              horseId: runner.id,
              eventId: item.id,
              marketKey: 'win',
              outcomeName: runner.name
            }
          }))
        }
      ]
    }
  }

  const [nameA, nameB] = participantsFor(sportKey, item)
  const label = `${nameA} v ${nameB}`
  // UFC outcomes are already fighter names - no Home/Away to resolve.
  const resolve = (name) => (sportKey === 'ufc' ? name : name === 'Home' ? nameA : name === 'Away' ? nameB : name)
  return {
    id: item.id,
    label,
    kickoff: item.kickoff,
    markets: (item.markets ?? []).map((market) => ({
      key: market.key,
      label: market.label,
      outcomes: market.outcomes.map((outcome) => {
        const best = outcome.bestOdds
        const selectionName = resolve(outcome.name)
        return {
          name: selectionName,
          best,
          leg: {
            event: label,
            market: market.label,
            selection: selectionName,
            odds: best?.decimal,
            bookmaker: best?.bookmaker,
            link: best?.link,
            linkIsBetslip: best?.isBetslipLink,
            sport: sportKey,
            kickoff: item.kickoff,
            eventId: item.id,
            marketKey: market.key,
            outcomeName: outcome.name
          }
        }
      })
    }))
  }
}
