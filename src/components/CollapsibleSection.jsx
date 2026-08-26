// Collapsed-by-default section toggle, reusing AccountPage.jsx's own
// .account-group/.account-group-toggle/.account-group-body styling (those
// classes were already generic layout, not account-specific) rather than a
// second visual language for the same "long content, one tap away instead
// of always on screen" idea. AccountPage's own AccountGroup keeps its
// Set-based multi-group state local since it's juggling several groups at
// once; this is the simpler single-toggle shape other pages with just one
// collapsible block (like GroupFeedPage.jsx) can use directly.
export default function CollapsibleSection({ title, open, onToggle, children }) {
  return (
    <div className="account-group">
      <button className="account-group-toggle" type="button" onClick={onToggle} aria-expanded={open}>
        <span>{title}</span>
        <span className="market-header-meta">{open ? '▴' : '▾'}</span>
      </button>
      {open && <div className="account-group-body">{children}</div>}
    </div>
  )
}
