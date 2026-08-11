import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

// Persistent entry point into CoachGPT (src/pages/CoachGptPage.jsx) - a
// floating button rather than a 7th BottomNav icon. It used to be pinned to a
// fixed corner, where it could sit over feed cards and their actions; now it's
// draggable (drag to move, tap to open) and carries a small × to dismiss it.
// Both the position and the dismissal persist per-device. Dismissing doesn't
// bury the feature - Coach is still reachable from Messages and the inline
// "Ask Coach" buttons.
const POS_KEY = 'betmates:coachFabPos'
const HIDDEN_KEY = 'betmates:coachFabHidden'
const SIZE = 44
const EDGE = 8
const DRAG_THRESHOLD = 6 // px of movement before a press counts as a drag, not a tap

function loadPos() {
  try {
    const raw = JSON.parse(localStorage.getItem(POS_KEY))
    if (raw && Number.isFinite(raw.x) && Number.isFinite(raw.y)) return raw
  } catch {
    /* fall through to default */
  }
  return null
}

// Keep a position inside the viewport (after a resize/rotate, or a stale saved
// value) so the button can never strand off-screen.
function clamp(pos) {
  if (!pos) return null
  return {
    x: Math.min(Math.max(EDGE, pos.x), window.innerWidth - SIZE - EDGE),
    y: Math.min(Math.max(EDGE, pos.y), window.innerHeight - SIZE - EDGE)
  }
}

export default function CoachLauncher() {
  const location = useLocation()
  const navigate = useNavigate()
  const [hidden, setHidden] = useState(() => localStorage.getItem(HIDDEN_KEY) === '1')
  const [pos, setPos] = useState(loadPos)
  const drag = useRef(null)
  const posRef = useRef(pos)
  posRef.current = pos

  useEffect(() => {
    function onResize() {
      setPos((p) => clamp(p))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  if (location.pathname === '/coach' || hidden) return null

  function onPointerDown(e) {
    if (e.target.closest('.coach-fab-x')) return // let the dismiss button handle its own click
    // Without this, dragging the pointer over a link/image elsewhere on the
    // page mid-drag lets the browser interpret the gesture as "start a
    // native drag of that link" instead - which fires pointercancel on this
    // element's pointer capture and silently kills the drag right there.
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    drag.current = { startX: e.clientX, startY: e.clientY, offX: e.clientX - rect.left, offY: e.clientY - rect.top, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e) {
    const d = drag.current
    if (!d) return
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_THRESHOLD) return
    d.moved = true
    const next = clamp({ x: e.clientX - d.offX, y: e.clientY - d.offY })
    setPos(next)
  }

  function onPointerUp() {
    const d = drag.current
    drag.current = null
    if (!d) return
    if (d.moved) {
      if (posRef.current) localStorage.setItem(POS_KEY, JSON.stringify(posRef.current))
    } else {
      navigate('/coach') // a tap, not a drag - open the Coach
    }
  }

  // Safety net for the rare pointercancel preventDefault above doesn't
  // catch (an OS-level gesture, e.g.) - without this the button can get
  // stuck mid-drag since pointerup never fires for a cancelled sequence.
  function onPointerCancel() {
    drag.current = null
  }

  function dismiss() {
    localStorage.setItem(HIDDEN_KEY, '1')
    setHidden(true)
  }

  // A saved/dragged position drives left+top inline; otherwise fall back to the
  // default corner in CSS (bottom-left).
  const style = pos ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' } : undefined

  return (
    <div
      className="coach-fab"
      style={style}
      role="button"
      tabIndex={0}
      aria-label="Ask CoachGPT (drag to move)"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          navigate('/coach')
        }
      }}
    >
      🧠
      <button className="coach-fab-x" type="button" aria-label="Hide the Coach button" onClick={dismiss}>
        ×
      </button>
    </div>
  )
}
