// Dark is the app's default (matches :root's base palette in style.css,
// no data-theme attribute needed for it) - light is an explicit opt-in,
// not a prefers-color-scheme follow, since it's meant to be a saved
// choice in Account rather than tracking the OS setting.
const KEY = 'betmates:theme'

export function getStoredTheme() {
  return localStorage.getItem(KEY)
}

export function applyTheme(theme) {
  if (theme === 'light') document.documentElement.setAttribute('data-theme', 'light')
  else document.documentElement.removeAttribute('data-theme')
  // Keeps the mobile browser chrome/PWA status bar matching the page
  // instead of staying dark when the page itself has gone light.
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f5efe1' : '#15120f')
}

export function setTheme(theme) {
  if (theme === 'light') localStorage.setItem(KEY, 'light')
  else localStorage.removeItem(KEY)
  applyTheme(theme)
}
