// Scores a predicted final order against a snapshot of the real standings -
// golf-style, lower is better: for each name, how many places off its
// predicted position was from its actual one, summed across the list. A
// name missing from either list (the standings snapshot predates this
// prediction, or vice versa - see supabase/schema.sql's predictors table)
// is skipped rather than penalised, so partial data never scores worse
// than no data at all.
export function scorePrediction(predictedOrder, currentStandings) {
  if (!predictedOrder?.length || !currentStandings?.length) return null
  let total = 0
  let counted = 0
  predictedOrder.forEach((name, i) => {
    const actualIndex = currentStandings.indexOf(name)
    if (actualIndex === -1) return
    total += Math.abs(actualIndex - i)
    counted++
  })
  return counted ? total : null
}

// Ranks every member's entry against the current standings, sharpest
// (lowest score) first. Entries with nothing comparable are dropped rather
// than shown at the bottom with a fake worst score.
export function rankPredictions(entries, currentStandings, names) {
  return (entries ?? [])
    .map((e) => ({ ...e, name: names?.[e.userId] ?? 'Someone', score: scorePrediction(e.predictedOrder, currentStandings) }))
    .filter((row) => row.score !== null)
    .sort((a, b) => a.score - b.score)
}
