import { Component } from 'react'
import posthog from 'posthog-js'
import * as dataStore from '../lib/dataStore.js'

// Every route is lazy-loaded (see App.jsx) and the service worker updates
// itself on a new deploy (registerType: 'autoUpdate'), which makes one
// failure mode routine rather than exotic: a user holding a cached
// index.html from the previous deploy navigates, the app asks for a chunk
// whose hashed filename no longer exists, and the dynamic import rejects.
// React has no way to recover from that on its own - without a boundary it
// unmounts the whole tree and leaves a blank page, on what is really just a
// stale tab.
//
// So chunk failures get handled differently from everything else: reload
// once to pick up the current index.html, which fixes it. sessionStorage
// holds the "already tried" flag so a genuinely broken deploy turns into a
// visible error instead of a reload loop.
const RELOADED_KEY = 'betmates:chunk-reload'

function isChunkLoadError(error) {
  const message = String(error?.message ?? '')
  return (
    error?.name === 'ChunkLoadError' ||
    /Loading chunk|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i.test(message)
  )
}

export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    if (isChunkLoadError(error) && !sessionStorage.getItem(RELOADED_KEY)) {
      sessionStorage.setItem(RELOADED_KEY, '1')
      window.location.reload()
      return
    }
    // Still log to console - devtools remains the fastest path when a
    // developer is actually looking. The dataStore call is best-effort:
    // logging a crash must never itself throw and mask the original error,
    // and a network/RLS failure here shouldn't matter to the user at all.
    console.error('Unhandled error:', error)
    posthog.captureException(error)
    dataStore
      .logClientError({ message: String(error?.message ?? error), stack: error?.stack ?? null, route: window.location.hash || null })
      .catch(() => {})
  }

  handleReload = () => {
    sessionStorage.removeItem(RELOADED_KEY)
    window.location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children

    const stale = isChunkLoadError(this.state.error)
    return (
      <div className="error-boundary">
        <h1>{stale ? 'BetMates has been updated' : 'Something went wrong'}</h1>
        <p>
          {stale
            ? 'This tab is running an older version. Reload to pick up the latest one.'
            : "That page hit an error and couldn't load. Your bets and settings are unaffected."}
        </p>
        <button type="button" className="primary" onClick={this.handleReload}>
          Reload
        </button>
      </div>
    )
  }
}
