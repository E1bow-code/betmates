import { fetchRaces } from '../api/oddsClient.js'
import { formatOffTime, formatCountdown } from '../utils/format.js'

export async function renderRaceList(container) {
  container.innerHTML = `<div class="topbar"><h1>Today's Races</h1></div><div class="loading">Loading races…</div>`

  let races
  try {
    races = await fetchRaces()
  } catch (err) {
    container.innerHTML = `<div class="topbar"><h1>Today's Races</h1></div><div class="error">Couldn't load races: ${err.message}</div>`
    return
  }

  if (!races.length) {
    container.innerHTML = `<div class="topbar"><h1>Today's Races</h1></div><div class="empty">No races found.</div>`
    return
  }

  container.innerHTML = `
    <div class="topbar"><h1>Today's Races</h1></div>
    <div class="race-list">
      ${races.map(raceCard).join('')}
    </div>
  `
}

function raceCard(race) {
  const favourite = [...race.runners].sort((a, b) => a.bestOdds.decimal - b.bestOdds.decimal)[0]
  return `
    <a class="race-card" href="#/race/${race.id}">
      <div class="race-card-time">
        <span class="off-time">${formatOffTime(race.offTime)}</span>
        <span class="countdown">${formatCountdown(race.offTime)}</span>
      </div>
      <div class="race-card-main">
        <div class="race-card-title">${race.course} · ${race.raceName}</div>
        <div class="race-card-meta">${race.raceClass} · ${race.distance} · ${race.going} · ${race.runners.length} runners</div>
      </div>
      <div class="race-card-fav">
        <div class="fav-label">Favourite</div>
        <div class="fav-name">${favourite.name}</div>
        <div class="fav-price">${favourite.bestOdds.price}</div>
      </div>
    </a>
  `
}
