// Local-only video blob storage (IndexedDB) for the Tips feed - used only
// when Supabase isn't configured (see localBackend.js's uploadVideoBlob/
// getVideoPlaybackUrl). localStorage can't hold binary data at any real
// size, so blobs live here while their metadata (author, caption, tag,
// timestamps) lives alongside everything else in src/lib/localBackend.js.
// When Supabase IS configured, dataStore.js's uploadVideoBlob/
// getVideoPlaybackUrl hit Supabase Storage instead, so clips actually sync
// across devices - this file's local-only limit no longer applies there.

const DB_NAME = 'betmates-videos'
const STORE = 'clips'

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveVideoBlob(key, blob) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(blob, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function getVideoBlob(key) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(key)
    req.onsuccess = () => resolve(req.result ?? null)
    req.onerror = () => reject(req.error)
  })
}

export async function deleteVideoBlob(key) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
