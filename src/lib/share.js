// Shared Web Share API helper with a clipboard fallback for browsers/
// contexts where navigator.share isn't available (desktop Chrome/Firefox,
// non-secure contexts). Returns how it went so callers can show the right
// confirmation copy ("Shared" vs "Copied").
export async function shareOrCopy({ title, text, url }) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url })
      return 'shared'
    } catch (err) {
      if (err.name === 'AbortError') return 'cancelled'
      // Fall through to clipboard on any other share failure.
    }
  }
  await navigator.clipboard.writeText(url ? `${text}\n${url}` : text)
  return 'copied'
}

export function groupInviteUrl(inviteCode) {
  return `${window.location.origin}/#/join/${inviteCode}`
}

export function publicProfileUrl(friendCode) {
  return `${window.location.origin}/#/u/${friendCode}`
}

export function referralUrl(friendCode) {
  return `${window.location.origin}/#/r/${friendCode}`
}
