// Web Push subscribe/unsubscribe on this device. The actual notification
// display happens in src/sw.js's 'push' handler; sending happens server-
// side in netlify/functions/send-push.js (needs the VAPID private key,
// which never reaches the client).
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

export function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && !!VAPID_PUBLIC_KEY
}

export async function getPushSubscription() {
  if (!('serviceWorker' in navigator)) return null
  const registration = await navigator.serviceWorker.ready
  return registration.pushManager.getSubscription()
}

export async function subscribeToPush() {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notification permission was not granted.')
  const registration = await navigator.serviceWorker.ready
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
  })
}

export async function unsubscribeFromPush() {
  const subscription = await getPushSubscription()
  if (subscription) await subscription.unsubscribe()
}

// A rotated VAPID key invalidates every subscription created under the old
// one - the push service silently starts rejecting sends, and nothing
// client-side would otherwise notice. Called on mount (see AccountPage.jsx)
// so a device self-heals next time it opens the app: if the browser's
// existing subscription was created against a different applicationServerKey
// than the one currently configured, drop it and re-subscribe with the
// current key. permission is already 'granted' at this point (that's how
// the stale subscription exists), so subscribeToPush() won't re-prompt.
// Returns the fresh subscription if a resubscribe happened - the caller
// should persist it - or null if the existing subscription was already
// current, or nothing was subscribed to begin with.
export async function refreshStaleSubscription() {
  const subscription = await getPushSubscription()
  if (!subscription) return null

  const currentKey = subscription.options?.applicationServerKey
  if (!currentKey) return null // older browser without PushSubscriptionOptions support - leave it alone

  const expected = urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
  const actual = new Uint8Array(currentKey)
  const stale = expected.length !== actual.length || expected.some((byte, i) => byte !== actual[i])
  if (!stale) return null

  await subscription.unsubscribe()
  return subscribeToPush()
}
