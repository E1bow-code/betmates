import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './style.css'
import App from './App.jsx'
import { applyTheme, getStoredTheme } from './lib/theme.js'
// Side-effect import: attaches the beforeinstallprompt listener at startup so
// the native install offer isn't missed (it fires once, early - see the file).
import './lib/installPrompt.js'

// Applied before the first render, not inside a React effect, so a saved
// light-mode preference doesn't flash dark for a frame on load.
applyTheme(getStoredTheme())

createRoot(document.getElementById('app')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
