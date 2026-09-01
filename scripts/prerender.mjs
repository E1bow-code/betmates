// Build-time prerender of the public landing page (issue #131).
//
// Runs AFTER `vite build` (see package.json's "build" script). As an SPA the
// app ships an empty `<div id="app"></div>` to anything that doesn't run JS -
// crawlers, social unfurlers, a slow first paint. This bakes the real,
// SSR-safe landing markup (src/prerender/LandingStatic.jsx) straight into
// dist/index.html so that HTML carries the hero copy on its own.
//
// No headless browser: the markup is produced with react-dom/server's
// renderToStaticMarkup, loaded through Vite's ssrLoadModule so JSX and the
// src/ graph resolve via the project's existing Vite config. That matters for
// Netlify - its build image has no Chromium, so a puppeteer-style prerender
// could pass locally and break the deploy. This approach needs only the deps
// already in package.json (react-dom, vite), so `npm run build` stays green
// wherever it runs.
//
// Only the public, auth-free landing at "/" is prerendered. Authed routes
// (/tracker, groups, account, ...) are never rendered here - they depend on a
// session and would bake a wrong/empty shell. The client uses createRoot (not
// hydrateRoot) in main.jsx, so on load React discards this static markup and
// renders the live app; there is no hydration-mismatch risk, only a better
// first paint and real content for crawlers.

import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createServer } from 'vite'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDir, '..')
const distIndex = resolve(projectRoot, 'dist/index.html')

// The empty mount point vite emits into dist/index.html. If Vite ever changes
// how it serializes this, fail loudly rather than silently skipping the inject.
const EMPTY_APP = '<div id="app"></div>'

async function main() {
  const html = await readFile(distIndex, 'utf8')
  if (!html.includes(EMPTY_APP)) {
    throw new Error(
      `prerender: could not find ${EMPTY_APP} in dist/index.html - the mount ` +
        'point markup changed, so the landing copy was not injected. Update ' +
        'scripts/prerender.mjs.'
    )
  }

  // middlewareMode + appType 'custom' spins up Vite's transform pipeline
  // without starting an HTTP server or opening the browser - we only want
  // ssrLoadModule. Kept quiet so it doesn't clutter the build log.
  const vite = await createServer({
    root: projectRoot,
    logLevel: 'warn',
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
    // We only use ssrLoadModule, never serve client requests, so the dependency
    // pre-bundle scan is pure overhead - and because it runs async in the
    // background, vite.close() aborts it mid-flight and it logs a scary (but
    // harmless) "Failed to scan for dependencies" rejection. noDiscovery stops
    // the scan from starting at all, keeping the build log clean.
    optimizeDeps: { noDiscovery: true }
  })

  try {
    const { renderLanding } = await vite.ssrLoadModule('/src/prerender/entry.jsx')
    const rendered = renderLanding()
    const injected = html.replace(EMPTY_APP, `<div id="app">${rendered}</div>`)
    await writeFile(distIndex, injected, 'utf8')
    console.log(`prerender: injected landing markup into dist/index.html (${rendered.length} chars)`)
  } finally {
    await vite.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
