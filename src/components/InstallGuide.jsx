// Shared step list - used inline in a dismissible banner (App.jsx) and
// permanently in Account, so first-time visitors see it once and anyone who
// dismissed it can still find it again later without hunting.
export default function InstallGuide() {
  return (
    <ol className="install-guide-steps">
      <li>
        Tap the <strong>Share</strong> button in Safari's toolbar (the square with an arrow pointing up).
      </li>
      <li>
        Scroll down and tap <strong>Add to Home Screen</strong>.
      </li>
      <li>
        Tap <strong>Add</strong> in the top right.
      </li>
    </ol>
  )
}
