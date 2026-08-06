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

// Sport banners and player shots come from Pexels' CDN, so they're outside
// the precache manifest (which only covers our own built assets) and were
// re-downloaded on every cold load. They're the heaviest thing the app
// fetches and they never change under a given URL - a hashed CDN filename
// is already immutable - so serve them from cache and only go to the
// network on a miss. Capped and expired so a long-lived install can't grow
// this without limit; opaque cross-origin responses are excluded, since
// caching those would store failures indistinguishably from successes.
registerRoute(
  ({ request, url }) => request.destination === 'image' && url.origin !== self.location.origin,
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
