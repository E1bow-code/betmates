// Local-only video blob storage (IndexedDB) for the Tips feed. Recorded/
// uploaded clips never leave this browser today - localStorage can't hold
// binary data at any real size, so blobs live here while their metadata
// (author, caption, tag, timestamps) lives alongside everything else in
// src/lib/localBackend.js. Swapping to real storage later (e.g. Supabase
// Storage) means replacing the three functions below and pointing
// video_posts.storage_key at a remote URL instead of an IndexedDB key -
// see the note in supabase/schema.sql.

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
