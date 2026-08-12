import { Link } from 'react-router-dom'
import { formatKickoff } from '../utils/format.js'

// Racing's own featured callout, sibling to ValueFinder.jsx's "value on
// the board" panel - ValueFinder explicitly skips racing (no h2h market
// to find an edge in, see valueFinder.js), so this fills the same "here's
// something worth a second look before you start scrolling" role. A
// single pick rather than a list, so no collapse/expand like ValueFinder.
export default function HorseOfTheDayCard({ horse }) {
  if (!horse) return null
  return (
    <Link className="horse-of-the-day" to={`/odds/racing/${horse.raceId}`}>
      <div className="horse-of-the-day-head">
        <span className="horse-of-the-day-title">🏇 Horse of the Day</span>
        <span className="horse-of-the-day-figure">Speed figure {horse.speedFigure}</span>
      </div>
      <div className="horse-of-the-day-body">
        <span className="horse-of-the-day-name">{horse.horseName}</span>
        <span className="horse-of-the-day-meta">
          {horse.course} · {formatKickoff(horse.offTime)}
          {horse.jockey ? ` · ${horse.jockey}` : ''}
        </span>
      </div>
    </Link>
  )
}
