import { fetchRace } from '../api/oddsClient.js'
import { formatOffTime, formatCountdown } from '../utils/format.js'

export async function renderRaceDetail(container, raceId) {
  container.innerHTML = `<div class="topbar"><a href="#/" class="back">&larr; Races</a></div><div class="loading">Loading runners…</div>`

  let race
  try {
    race = await fetchRace(raceId)
  } catch (err) {
    container.innerHTML = `<div class="topbar"><a href="#/" class="back">&larr; Races</a></div><div class="error">Couldn't load race: ${err.message}</div>`
    return
  }

  if (!race) {
    container.innerHTML = `<div class="topbar"><a href="#/" class="back">&larr; Races</a></div><div class="empty">Race not found.</div>`
    return
  }

  const runners = [...race.runners].sort((a, b) => a.bestOdds.decimal - b.bestOdds.decimal)

  container.innerHTML = `
    <div class="topbar"><a href="#/" class="back">&larr; Races</a></div>
    <div class="race-header">
      <h1>${race.course} · ${race.raceName}</h1>
      <div class="race-header-meta">
        ${formatOffTime(race.offTime)} (${formatCountdown(race.offTime)}) · ${race.raceClass} · ${race.distance} · ${race.going}
      </div>
    </div>
    <div class="runner-list">
      ${runners.map(runnerRow).join('')}
    </div>
  `

  container.querySelectorAll('.runner-row').forEach((row) => {
    row.addEventListener('click', () => row.classList.toggle('expanded'))
  })
}

function runnerRow(runner) {
  return `
    <div class="runner-row">
      <div class="runner-summary">
        <span class="runner-silk" style="background:${runner.silkColor}">${runner.number}</span>
        <div class="runner-info">
          <div class="runner-name">${runner.name}</div>
          <div class="runner-connections">${runner.jockey} · ${runner.trainer}</div>
        </div>
        <div class="runner-best">
          <div class="best-price">${runner.bestOdds.price}</div>
          <div class="best-bookmaker">${runner.bestOdds.bookmaker}</div>
        </div>
      </div>
      <div class="runner-all-odds">
        ${runner.allOdds
          .map(
            (o) => `
          <div class="odds-cell ${o.bookmaker === runner.bestOdds.bookmaker ? 'is-best' : ''}">
            <span class="odds-bookmaker">${o.bookmaker}</span>
            <span class="odds-price">${o.price}</span>
          </div>
        `
          )
          .join('')}
      </div>
    </div>
  `
}
