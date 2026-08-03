import { useEffect, useRef, useState } from 'react'

const THRESHOLD = 70

// Native listeners (not JSX onTouch* props) so touchmove can be registered
// non-passive - needed to preventDefault the browser's own overscroll bounce
// while dragging, otherwise the page scrolls AND the indicator fights it.
// Only arms when the scroll container is already at the top, so this never
// interferes with normal scrolling through the list below.
export default function PullToRefresh({ onRefresh, children }) {
  const containerRef = useRef(null)
  const startY = useRef(null)
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    function atTop() {
      return (document.scrollingElement?.scrollTop ?? window.scrollY) <= 0
    }

    function onTouchStart(e) {
      if (refreshing) return
      startY.current = atTop() ? e.touches[0].clientY : null
    }

    function onTouchMove(e) {
      if (startY.current === null || refreshing) return
      const delta = e.touches[0].clientY - startY.current
      if (delta <= 0) {
        setPull(0)
        return
      }
      if (!atTop()) {
        startY.current = null
        setPull(0)
        return
      }
      e.preventDefault()
      setPull(Math.min(delta * 0.5, 100))
    }

    async function onTouchEnd() {
      if (startY.current === null || refreshing) return
      startY.current = null
      setPull((current) => {
        if (current >= THRESHOLD) {
          setRefreshing(true)
          Promise.resolve(onRefresh?.()).finally(() => {
            setRefreshing(false)
            setPull(0)
          })
          return THRESHOLD
        }
        return 0
      })
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('touchcancel', onTouchEnd)
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [onRefresh, refreshing])

  return (
    <div ref={containerRef}>
      <div
        className="pull-refresh-indicator"
        style={{ height: pull, opacity: Math.min(pull / THRESHOLD, 1) }}
      >
        {refreshing ? (
          <span className="pull-refresh-spinner" />
        ) : (
          <span>{pull >= THRESHOLD ? 'Release to refresh' : 'Pull to refresh'}</span>
        )}
      </div>
      {children}
    </div>
  )
}
