// Recent-form and rating data for one runner, shown inside RaceDetailPage's
// existing expand-on-tap section. Every field is optional (theracingapi
// doesn't have a rating/spotlight for every runner, and mock data mirrors
// that patchiness deliberately) - this renders nothing at all if a runner
// has none of it, rather than an empty-looking block.
const FORM_LEGEND = { 1: 'win', 2: 'placed', 3: 'placed' }

function formChips(form) {
  if (!form) return null
  return form.split('').map((char, i) => {
    if (char === '-') return { key: i, divider: true }
    const kind = /[0-9]/.test(char) ? FORM_LEGEND[char] ?? 'ran' : 'nonfinish'
    return { key: i, char, kind }
  })
}

export default function RunnerForm({ runner }) {
  const chips = formChips(runner.form)
  const facts = [
    runner.speedFigure && `Speed ${runner.speedFigure}`,
    runner.officialRating && `OR ${runner.officialRating}`,
    runner.racingPostRating && `RPR ${runner.racingPostRating}`,
    runner.age && `${runner.age}yo`,
    runner.weightLbs && `${runner.weightLbs}lb`,
    runner.draw && `Stall ${runner.draw}`,
    runner.headgear && `Headgear: ${runner.headgear.toUpperCase()}`,
    runner.daysSinceLastRun && `Last ran ${runner.daysSinceLastRun}d ago`
  ].filter(Boolean)

  if (!chips && !facts.length && !runner.spotlight) return null

  return (
    <div className="runner-form">
      {chips && (
        <div className="runner-form-chips">
          <span className="runner-form-label">Form</span>
          {chips.map((c) =>
            c.divider ? (
              <span key={c.key} className="runner-form-divider" aria-hidden="true" />
            ) : (
              <span key={c.key} className={`runner-form-chip runner-form-chip-${c.kind}`}>
                {c.char}
              </span>
            )
          )}
        </div>
      )}
      {facts.length > 0 && <div className="runner-form-facts">{facts.join(' · ')}</div>}
      {runner.spotlight && <p className="runner-form-spotlight">{runner.spotlight}</p>}
    </div>
  )
}
