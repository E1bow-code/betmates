import { useState } from 'react'

const KEY = 'betmates:myBookiesOnly'

// "My bookies only" used to be separate, un-persisted local state on
// OddsListPage.jsx and each of the four event detail pages (Fixture/Race/
// Fight/Generic) - toggling it on the list, or on one fixture, had no
// effect anywhere else, so anyone who actually relies on it had to
// re-toggle it on every single page they opened. One shared, persisted
// value instead, same idea as src/lib/theme.js's stored preference - set
// it once, it sticks everywhere this filter appears.
export function useMyBookiesOnly() {
  const [myBookiesOnly, setMyBookiesOnlyState] = useState(() => {
    try {
      return localStorage.getItem(KEY) === '1'
    } catch {
      return false
    }
  })

  function setMyBookiesOnly(next) {
    try {
      localStorage.setItem(KEY, next ? '1' : '0')
    } catch {
      // ignore - private browsing / storage disabled, just won't persist this session
    }
    setMyBookiesOnlyState(next)
  }

  return [myBookiesOnly, setMyBookiesOnly]
}
