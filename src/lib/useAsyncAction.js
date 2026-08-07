import { useCallback } from 'react'
import { useToast } from '../context/ToastContext.jsx'

// Wraps a user-initiated async action (a click, a form submit) so a thrown
// error always shows a toast instead of the control silently reverting to
// its old state with nothing said. An audit of this codebase found the
// bet-settlement dropdown, five separate follow-star buttons, chat send,
// the spend-limit save, and a handful of others all had a bare
// try/finally (or no try at all) - a failed write looked identical to
// "nothing happened" from the user's side, with no error anywhere.
//
// Deliberately doesn't own busy/loading state itself - callers already
// track that in different shapes (a plain boolean, a set of in-flight
// ids, an entry id) and forcing one shape here would fight all of them.
// Just wrap the existing async call: `runAsync(() => doThing(), "message")`.
//
// Resolves to a plain boolean - true on success, false on failure (after
// showing the toast) - rather than the callback's own return value, since
// several of the calls this wraps legitimately resolve to undefined on
// success too (dataStore writes with no return value), which would make
// "did it work" indistinguishable from "it didn't." A caller that needs
// the actual result on success should capture it via a closure variable
// inside `fn` rather than relying on runAsync's return value. Never
// rejects, so callers don't need their own try/catch just to avoid an
// unhandled rejection.
export function useAsyncAction() {
  const { showToast } = useToast()

  return useCallback(
    async (fn, errorMessage = "Something went wrong - try again") => {
      try {
        await fn()
        return true
      } catch (err) {
        showToast(err?.message || errorMessage)
        return false
      }
    },
    [showToast]
  )
}
