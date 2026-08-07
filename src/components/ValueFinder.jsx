import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { findBoardValue } from '../utils/valueFinder.js'
import { formatOdds } from '../utils/oddsFormat.js'

// "Value on the board" - the standout best-price edges across the fixtures
// currently loaded, so there's a reason to open the app even before you know
// what you want to bet on. Collapsible and self-hiding: renders nothing when
// nothing clears the value threshold (see valueFinder.js / bestValue.js).
export default function ValueFinder({ items, sportKey, format }) {
  const [open, setOpen] = useState(true)
  const value = useMemo(() => findBoardValue(items, sportKey), [items, sportKey])

  if (!value.length) return null

  return (
    <div className="value-finder">
      <button className="value-finder-head" onClick={() => setOpen((o) => !o)} type="button" aria-expanded={open}>
        <span className="value-finder-title">💎 Value on the board</span>
        <span className="value-finder-meta">
          {value.length} {open ? '▴' : '▾'}
        </span>
      </button>
      {open && (
        <div className="value-finder-list">
          {value.map((v) => (
            <Link key={`${v.id}-${v.selection}`} className="value-row" to={`/odds/${v.sportKey}/${v.id}`}>
              <span className="value-row-main">
                <span className="value-row-selection">{v.selection}</span>
                <span className="value-row-matchup">{v.matchup}</span>
              </span>
              <span className="value-row-right">
                <span className="value-row-price">{formatOdds(v.best, format)}</span>
                <span className="value-row-edge">+£{v.extraPer10.toFixed(2)}/£10 · {v.bookmaker}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
