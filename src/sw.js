// Custom service worker (vite-plugin-pwa injectManifest strategy) instead
// of the auto-generated one - needed because Web Push notifications only
// work if *something* in the SW listens for 'push' and calls
// showNotification; the generated-SW strategy used until now doesn't let
// custom event listeners in. Precaching below replicates exactly what the
// generated SW was doing before.
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { ExpirationPlugin } from 'workbox-expiration'

self.skipWaiting()
clientsClaim()
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// Sport hero banners are outside the precache manifest (which only covers
// our own built assets) and were re-downloaded on every cold load. They're
// immutable under a given URL - a hashed CDN filename never changes - so
// serve them from cache and only go to the network on a miss. Capped and
// expired so a long-lived install can't grow this without limit; opaque
// cross-origin responses are excluded, since caching those would store
// failures indistinguishably from successes.
//
// Scoped to images.pexels.com only - two other hosts were tried and both
// broke real photos, confirmed live rather than assumed:
//   - Any cross-origin image (the original matcher) also caught Supabase
//     Storage URLs (avatars, post photos/videos), which are user-uploaded
//     and mutable. CacheFirst never revalidates, so a stale or failed
//     avatar fetch got stuck there indefinitely - clearing the browser's
//     HTTP cache doesn't touch a service worker's separate Cache Storage,
//     so it looked permanent until the SW itself updated.
//   - *.thesportsdb.com (team badges/player photos) sends no
//     Access-Control-Allow-Origin header at all, unlike Pexels - a plain
//     <img> tag loads that fine on its own (browsers don't need CORS for
//     opaque no-cors image loads), but routing it through this Workbox
//     CacheFirst strategy made the fetch fail outright (confirmed:
//     fetch(url, {mode:'no-cors'}) throws "Failed to fetch" when this
//     page is service-worker-controlled, succeeds when it isn't) - some
//     part of the cache-write path chokes on the opaque response for this
//     particular CDN. Left client-side (BetCard.jsx/TeamBadge.jsx etc.
//     just render a plain <img src=...>), uncached but working, rather
//     than chasing the exact Workbox internals.
// vite.config.js's registerType: 'autoUpdate' plus this file's own
// skipWaiting()/clientsClaim() above mean a fixed SW takes over
// automatically on the visitor's next load, no manual unregister needed.
registerRoute(
  ({ request, url }) => request.destination === 'image' && url.hostname === 'images.pexels.com',
  new CacheFirst({
    cacheName: 'betmates-remote-images',
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60, purgeOnQuotaError: true })
    ]
  })
)

self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'BetMates', {
      body: data.body ?? '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url ?? '/' }
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // An already-open window has to be navigated as well as focused. Just
      // focusing it - which is all this did - drops the notification's url
      // and leaves the user on whatever page they had open, so every deep
      // link (the settled bet, the new comment) silently went nowhere in
      // the one case that's most common on mobile: the app still running in
      // the background. openWindow is only right when nothing is open.
      for (const client of clientList) {
        if ('focus' in client) {
          const focused = client.focus()
          if ('navigate' in client) return Promise.resolve(focused).then(() => client.navigate(url).catch(() => {}))
          return focused
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })
  )
})
