import { renderToStaticMarkup } from 'react-dom/server'
import LandingStatic from './LandingStatic.jsx'

// Loaded via Vite's ssrLoadModule from scripts/prerender.mjs (so the JSX and
// the src/ module graph are transformed by the project's own Vite config, with
// no headless browser and nothing added to the client bundle). Returns the
// static landing markup as a string for injection into dist/index.html.
export function renderLanding() {
  return renderToStaticMarkup(<LandingStatic />)
}
