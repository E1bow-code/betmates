import { useEscapeKey } from '../lib/useEscapeKey.js'
import FixtureChatPanel from './FixtureChatPanel.jsx'

// Opened by tapping a live BetCard's LIVE badge (see BetCard.jsx) - same
// sheet-backdrop/sheet shell as ParticipantProfileSheet, just wrapping the
// existing FixtureChatPanel (normally mounted inline on the fixture detail
// pages) instead of building a second chat UI. defaultOpen skips its own
// collapsed-by-default toggle, since the whole point of this sheet is "show
// me the chat" - a second tap to expand it here would be redundant.
export default function FixtureChatSheet({ sport, eventId, eventLabel, onClose }) {
  useEscapeKey(onClose)

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <h2 className="sheet-title">{eventLabel}</h2>
        <FixtureChatPanel sport={sport} eventId={eventId} eventLabel={eventLabel} defaultOpen />
        <div className="sheet-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
