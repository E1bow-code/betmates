// Shared click/keyboard dismissal for the `sheet-backdrop` overlay every
// modal sheet renders (bet builder, odds alerts, more menu, video recorder,
// ...). The backdrop closes on a click or an Enter/Space press, but only when
// the event lands on the backdrop itself rather than the sheet inside it - the
// `target === currentTarget` guard is what lets clicks and key presses reach
// the sheet's own controls without dismissing it, and it replaces the
// `stopPropagation` the inner `.sheet` used to carry for the same reason. That
// guard also means a key press inside the sheet never bubbles up here to close
// it, so the document-level Escape listener (useEscapeKey) keeps working
// untouched. role/tabIndex/aria-label make the dismiss target keyboard-
// operable and named, which a bare div with an onClick was not.
export function backdropDismissProps(requestClose) {
  return {
    role: 'button',
    tabIndex: 0,
    'aria-label': 'Close',
    onClick: (e) => {
      if (e.target === e.currentTarget) requestClose()
    },
    onKeyDown: (e) => {
      if (e.target !== e.currentTarget) return
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        requestClose()
      }
    },
  }
}
