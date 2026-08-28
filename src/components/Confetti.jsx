import { useEffect, useRef } from 'react'

// A brief one-shot confetti burst for celebratory moments (e.g. hitting a
// win-streak milestone). Canvas-drawn, no dependency; self-clears after ~1.6s
// (calls onDone) and no-ops entirely under prefers-reduced-motion. A fixed,
// pointer-events:none overlay so it never blocks the UI.
export default function Confetti({ onDone }) {
  const ref = useRef(null)
  // Hold onDone in a ref so the animation effect can run exactly once per mount
  // (empty deps) while still calling the latest callback. The only caller passes
  // an inline `() => setCelebrate(false)`, whose identity changes on every parent
  // render - and TrackerPage re-renders every 30s on live-score polls. Keying the
  // effect on onDone would tear down and restart the burst from frame zero on any
  // such render mid-flight (and, if renders arrived faster than the 1.6s run,
  // onDone would never fire and the celebration would never clear).
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const canvas = ref.current
    if (reduce || !canvas) {
      onDoneRef.current?.()
      return
    }
    const ctx = canvas.getContext('2d')
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = window.innerWidth
    const h = window.innerHeight
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.scale(dpr, dpr)

    const colors = ['#45d67f', '#6aa5ff', '#ff8a3d', '#f4bb4c', '#ff77b6']
    const parts = Array.from({ length: 130 }, () => ({
      x: w / 2 + (Math.random() - 0.5) * w * 0.35,
      y: h * 0.28 + (Math.random() - 0.5) * 40,
      vx: (Math.random() - 0.5) * 9,
      vy: -6 - Math.random() * 7,
      s: 4 + Math.random() * 5,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.32,
      c: colors[Math.floor(Math.random() * colors.length)]
    }))

    let raf
    let start
    function frame(t) {
      if (!start) start = t
      const elapsed = t - start
      ctx.clearRect(0, 0, w, h)
      for (const p of parts) {
        p.vy += 0.3 // gravity
        p.x += p.vx
        p.y += p.vy
        p.rot += p.vr
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.globalAlpha = Math.max(0, 1 - elapsed / 1600)
        ctx.fillStyle = p.c
        ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6)
        ctx.restore()
      }
      if (elapsed < 1600) raf = requestAnimationFrame(frame)
      else onDoneRef.current?.()
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])

  return <canvas ref={ref} className="confetti-canvas" aria-hidden="true" />
}
