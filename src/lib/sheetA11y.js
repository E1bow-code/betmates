// Bottom-sheet modal accessibility, in one place.
//
// Every sheet in the app hand-rolls the same `.sheet-backdrop > .sheet` markup
// (there's no shared Sheet component to hang this on), and each already closes
// on Escape (useEscapeKey) and backdrop-click - but none of them announce
// themselves as a dialog, move focus in when they open, trap Tab inside while
// open, or return focus to the opener on close. For a keyboard or screen-reader
// user that makes them effectively non-modal: focus stays on the trigger behind
// the sheet and can Tab into the obscured page.
//
// Rather than edit ~16 components, install() watches the DOM for a `.sheet`
// appearing and enhances it - which also covers any sheet added later for free.
// It focuses the sheet container itself (not the first input) on open, so a
// mobile keyboard doesn't spring up unbidden; the dialog is still announced via
// aria-labelledby on the sheet's own title, and Tab then moves into the content.
//
// Returns a cleanup that disconnects everything.
export function installSheetA11y() {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {}

  const openers = new WeakMap() // sheet element -> whatever was focused before it opened
  let seq = 0

  const FOCUSABLE =
    'a[href],area[href],input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),button:not([disabled]),[tabindex]:not([tabindex="-1"])'
  // getClientRects() is length 0 for display:none / detached elements and works
  // regardless of position:fixed/absolute (unlike offsetParent), so it's the
  // reliable "is this actually visible" test inside a fixed-position sheet.
  const focusablesIn = (el) => Array.from(el.querySelectorAll(FOCUSABLE)).filter((n) => n.getClientRects().length > 0)

  function enhance(sheet) {
    if (sheet.dataset.a11yReady) return
    sheet.dataset.a11yReady = '1'
    sheet.setAttribute('role', 'dialog')
    sheet.setAttribute('aria-modal', 'true')
    if (!sheet.hasAttribute('tabindex')) sheet.setAttribute('tabindex', '-1')
    const title = sheet.querySelector('.sheet-title')
    if (title && !sheet.getAttribute('aria-labelledby')) {
      if (!title.id) title.id = `sheet-title-${++seq}`
      sheet.setAttribute('aria-labelledby', title.id)
    }
    openers.set(sheet, document.activeElement)
    // rAF so the sheet is laid out (some animate in) before we move focus to it.
    requestAnimationFrame(() => {
      try {
        if (!sheet.contains(document.activeElement)) sheet.focus({ preventScroll: true })
      } catch (_) {
        /* focus can throw if the node vanished mid-frame - harmless */
      }
    })
  }

  function restore(sheet) {
    const opener = openers.get(sheet)
    openers.delete(sheet)
    if (opener && opener.isConnected && typeof opener.focus === 'function') {
      try {
        opener.focus()
      } catch (_) {
        /* opener may have unmounted - nothing to restore to */
      }
    }
  }

  document.querySelectorAll('.sheet').forEach(enhance)

  const obs = new MutationObserver((records) => {
    for (const rec of records) {
      rec.addedNodes.forEach((n) => {
        if (n.nodeType !== 1) return
        if (n.classList && n.classList.contains('sheet')) enhance(n)
        if (n.querySelectorAll) n.querySelectorAll('.sheet').forEach(enhance)
      })
      rec.removedNodes.forEach((n) => {
        if (n.nodeType !== 1) return
        if (n.classList && n.classList.contains('sheet')) restore(n)
        if (n.querySelectorAll) n.querySelectorAll('.sheet').forEach(restore)
      })
    }
  })
  obs.observe(document.body, { childList: true, subtree: true })

  // One global Tab-trap, operating on the topmost open sheet. Capture phase so
  // it runs before any component key handlers.
  function onKeyDown(e) {
    if (e.key !== 'Tab') return
    const sheets = document.querySelectorAll('.sheet')
    if (!sheets.length) return
    const sheet = sheets[sheets.length - 1]
    const items = focusablesIn(sheet)
    const active = document.activeElement
    if (!items.length) {
      e.preventDefault()
      sheet.focus()
      return
    }
    const firstEl = items[0]
    const lastEl = items[items.length - 1]
    if (!sheet.contains(active)) {
      e.preventDefault()
      firstEl.focus()
    } else if (e.shiftKey && active === firstEl) {
      e.preventDefault()
      lastEl.focus()
    } else if (!e.shiftKey && active === lastEl) {
      e.preventDefault()
      firstEl.focus()
    }
  }
  document.addEventListener('keydown', onKeyDown, true)

  return () => {
    obs.disconnect()
    document.removeEventListener('keydown', onKeyDown, true)
  }
}
