import { useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react'

const EASE = 'transform 0.32s cubic-bezier(0.2, 0.8, 0.2, 1)'

/**
 * Seitliches Blättern Karte für Karte, ohne Browser-Scrollen: Die Karten folgen dem Finger,
 * beim Loslassen geht es genau eine Karte weiter (ab ~18 % Weg oder schnellem Wisch) oder
 * zurück an den Platz. Senkrechtes Scrollen bleibt dem Browser überlassen.
 */
export function useSwipePager(count: number) {
  const [index, setIndex] = useState(0)
  const viewport = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: number; x: number; y: number; t: number; dx: number; axis: 'x' | 'y' | null } | null>(null)
  const dragged = useRef(false)
  const clamp = (i: number) => Math.max(0, Math.min(count - 1, i))

  const place = (dx: number, animate: boolean) => {
    const el = track.current
    if (!el) return
    el.style.transition = animate ? EASE : 'none'
    el.style.transform = `translate3d(calc(${-index * 100}% + ${dx}px), 0, 0)`
  }
  const go = (i: number) => {
    const next = clamp(i)
    if (track.current) track.current.style.transition = EASE
    if (next === index) place(0, true)
    else setIndex(next)
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), dx: 0, axis: null }
    dragged.current = false
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.axis) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
        d.axis = 'x'
        e.currentTarget.setPointerCapture(e.pointerId)
      } else if (Math.abs(dy) > 8) {
        drag.current = null
        return
      } else return
    }
    dragged.current = true
    // am Anfang und Ende gebremst
    const edge = (index === 0 && dx > 0) || (index === count - 1 && dx < 0)
    d.dx = edge ? dx * 0.3 : dx
    place(d.dx, false)
  }
  const onPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    drag.current = null
    if (!d || d.id !== e.pointerId || d.axis !== 'x') return
    const width = viewport.current?.clientWidth ?? 1
    const speed = d.dx / Math.max(1, performance.now() - d.t)
    let next = index
    if (d.dx < -width * 0.18 || speed < -0.35) next = index + 1
    else if (d.dx > width * 0.18 || speed > 0.35) next = index - 1
    go(next)
  }
  // Nach einem Wisch keinen Klick auf Links/Knöpfe in der Karte auslösen
  const onClickCapture = (e: MouseEvent) => {
    if (!dragged.current) return
    e.preventDefault()
    e.stopPropagation()
    dragged.current = false
  }

  const viewportProps = {
    ref: viewport,
    onPointerDown,
    onPointerMove,
    onPointerUp: onPointerEnd,
    onPointerCancel: onPointerEnd,
    onClickCapture,
    style: { overflow: 'hidden', touchAction: 'pan-y' } as CSSProperties,
  }
  const trackProps = {
    ref: track,
    style: { display: 'flex', transform: `translate3d(${-index * 100}%, 0, 0)`, transition: EASE, willChange: 'transform' } as CSSProperties,
  }
  return { index, go, viewportProps, trackProps }
}
