// Light is the app's default look - clean & bright (a data-theme='light'
// attribute on <html>, matching :root[data-theme='light'] in style.css). Dark
// is the explicit, saved opt-in (the bare :root palette). Not a
// prefers-color-scheme follow - it's a deliberate choice in Account, not OS
// tracking. index.html sets the attribute inline before first paint so the
// default/light user never flashes the dark base palette on load.
const KEY = 'betmates:theme'

export function getStoredTheme() {
  return localStorage.getItem(KEY)
}

// Anything that isn't an explicit 'dark' resolves to light, so a brand-new
// user (nothing stored) opens on the bright default.
function resolve(theme) {
  return theme === 'dark' ? 'dark' : 'light'
}

export function applyTheme(theme) {
  const resolved = resolve(theme)
  if (resolved === 'light') document.documentElement.setAttribute('data-theme', 'light')
  else document.documentElement.removeAttribute('data-theme')
  // Keep the mobile browser chrome / PWA status bar matching the page.
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'light' ? '#f6f5f1' : '#0a0a0d')
}

export function setTheme(theme) {
  const resolved = resolve(theme)
  if (resolved === 'dark') localStorage.setItem(KEY, 'dark')
  else localStorage.removeItem(KEY)
  applyTheme(resolved)
}
