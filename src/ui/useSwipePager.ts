import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react'

const EASE = 'transform 0.32s cubic-bezier(0.2, 0.8, 0.2, 1)'

/**
 * Seitliches Blättern Karte für Karte, ohne Browser-Scrollen: Die Karten folgen dem Finger,
 * beim Loslassen geht es genau eine Karte weiter (ab ~15 % Weg oder schnellem Wisch) oder
 * zurück an den Platz. Senkrechtes Scrollen bleibt dem Browser überlassen.
 *
 * Finger laufen über Touch-Events: Sobald die Bewegung waagerecht ist, blockiert `preventDefault`
 * alle Browser-Gesten (Scrollen, langes Drücken) – so bricht auch ein langsamer Wisch nicht ab.
 * Maus und Stift laufen über Pointer-Events.
 */
export function useSwipePager(count: number) {
  const [index, setIndex] = useState(0)
  const viewport = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; t: number; dx: number; axis: 'x' | 'y' | null; id: number | null } | null>(null)
  const dragged = useRef(false)
  const state = useRef({ index, count })
  useLayoutEffect(() => {
    state.current = { index, count }
  })

  const clamp = (i: number) => Math.max(0, Math.min(state.current.count - 1, i))
  const place = (dx: number, animate: boolean) => {
    const el = track.current
    if (!el) return
    el.style.transition = animate ? EASE : 'none'
    el.style.transform = `translate3d(calc(${-state.current.index * 100}% + ${dx}px), 0, 0)`
  }
  const go = (i: number) => {
    const next = clamp(i)
    if (track.current) track.current.style.transition = EASE
    if (next === state.current.index) place(0, true)
    else setIndex(next)
  }

  // Gemeinsame Logik für Finger und Maus
  const start = (x: number, y: number, id: number | null) => {
    drag.current = { x, y, t: performance.now(), dx: 0, axis: null, id }
    dragged.current = false
  }
  /** true = waagerechtes Wischen läuft (Browser-Geste blockieren) */
  const move = (x: number, y: number): boolean => {
    const d = drag.current
    if (!d) return false
    const dx = x - d.x
    const dy = y - d.y
    if (!d.axis) {
      // Leicht schräge Wische zählen noch als waagerecht
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 0.7) d.axis = 'x'
      else if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
        drag.current = null
        return false
      } else return false
    }
    dragged.current = true
    const { index: i, count: n } = state.current
    // am Anfang und Ende gebremst
    const edge = (i === 0 && dx > 0) || (i === n - 1 && dx < 0)
    d.dx = edge ? dx * 0.3 : dx
    place(d.dx, false)
    return true
  }
  const end = () => {
    const d = drag.current
    drag.current = null
    if (!d || d.axis !== 'x') return
    const width = viewport.current?.clientWidth ?? 1
    const speed = d.dx / Math.max(1, performance.now() - d.t)
    const i = state.current.index
    let next = i
    if (d.dx < -width * 0.15 || speed < -0.35) next = i + 1
    else if (d.dx > width * 0.15 || speed > 0.35) next = i - 1
    go(next)
  }

  // Finger: native Listener (touchmove nicht passiv, damit preventDefault wirkt). Callback-Ref,
  // damit sie auch an einem erst später erscheinenden Element hängen.
  const handlers = useRef({ start, move, end })
  useLayoutEffect(() => {
    handlers.current = { start, move, end }
  })
  const detach = useRef<(() => void) | null>(null)
  const setViewport = useCallback((el: HTMLDivElement | null) => {
    detach.current?.()
    detach.current = null
    viewport.current = el
    if (!el) return
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        drag.current = null
        return
      }
      handlers.current.start(e.touches[0].clientX, e.touches[0].clientY, null)
    }
    const onMove = (e: TouchEvent) => {
      const t = e.touches[0]
      if (t && handlers.current.move(t.clientX, t.clientY) && e.cancelable) e.preventDefault()
    }
    const onEnd = () => handlers.current.end()
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onEnd)
    detach.current = () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [])

  // Maus und Stift
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch' || (e.pointerType === 'mouse' && e.button !== 0)) return
    start(e.clientX, e.clientY, e.pointerId)
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (e.pointerType === 'touch' || !d || d.id !== e.pointerId) return
    const before = d.axis
    if (move(e.clientX, e.clientY) && !before) e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch' || drag.current?.id !== e.pointerId) return
    end()
  }
  // Nach einem Wisch keinen Klick auf Links/Knöpfe in der Karte auslösen
  const onClickCapture = (e: MouseEvent) => {
    if (!dragged.current) return
    e.preventDefault()
    e.stopPropagation()
    dragged.current = false
  }

  const viewportProps = {
    ref: setViewport,
    onPointerDown,
    onPointerMove,
    onPointerUp: onPointerEnd,
    onPointerCancel: onPointerEnd,
    onClickCapture,
    // Bilder und Text nicht mitziehen, kein Menü bei langem Drücken
    onDragStart: (e: MouseEvent) => e.preventDefault(),
    style: { overflow: 'hidden', touchAction: 'pan-y', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' } as CSSProperties,
  }
  const trackProps = {
    ref: track,
    style: { display: 'flex', transform: `translate3d(${-index * 100}%, 0, 0)`, transition: EASE, willChange: 'transform' } as CSSProperties,
  }
  return { index, go, viewportProps, trackProps }
}
