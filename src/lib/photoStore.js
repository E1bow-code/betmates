// Local-only photo blob storage (IndexedDB) for post photo attachments -
// used only when Supabase isn't configured (see localBackend.js's
// uploadPostPhoto/getPostPhotoUrl). Same reasoning and shape as
// videoStore.js: localStorage can't hold binary data at any real size, so
// blobs live here while their metadata (which post they belong to) lives
// alongside everything else in src/lib/localBackend.js.

const DB_NAME = 'betmates-photos'
const STORE = 'photos'

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

export async function savePhotoBlob(key, blob) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(blob, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function getPhotoBlob(key) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(key)
    req.onsuccess = () => resolve(req.result ?? null)
    req.onerror = () => reject(req.error)
  })
}
