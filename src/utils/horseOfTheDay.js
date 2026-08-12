// Today's single fastest-rated runner across every racecard currently
// loaded, by official speed figure (see speedFigure.js - a Racing Post
// "Topspeed"-style number, not a handicapper's opinion). Deliberately an
// objective, already-published number rather than an editorial "tip" -
// the app has no tipping desk to genuinely back one. Ties broken by
// earliest off-time so the pick is stable for a given fetch rather than
// depending on array iteration order.
//
// Returns null for missing/empty input or when nothing has a usable
// figure (mock data mirrors the live API's patchiness - not every runner
// carries one).
export function computeHorseOfTheDay(races) {
  if (!Array.isArray(races) || !races.length) return null
  let best = null
  for (const race of races) {
    for (const runner of race.runners ?? []) {
      const figure = Number(runner.speedFigure)
      if (!Number.isFinite(figure) || figure <= 0) continue
      const better =
        !best || figure > best.speedFigure || (figure === best.speedFigure && new Date(race.offTime) < new Date(best.offTime))
      if (!better) continue
      best = {
        horseId: runner.id,
        horseName: runner.name,
        jockey: runner.jockey ?? null,
        trainer: runner.trainer ?? null,
        speedFigure: figure,
        raceId: race.id,
        course: race.course,
        raceName: race.raceName,
        offTime: race.offTime
      }
    }
  }
  return best
}
