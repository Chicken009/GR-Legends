import { useEffect, type RefObject } from 'react'

/**
 * Seitliches Durchwischen Karte für Karte: Auch ein schwungvoller Wisch springt höchstens eine
 * Karte weiter. Ergänzt `scroll-snap-stop: always` für Browser, die das nicht können.
 */
export function useOneStep(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let start: number | null = null
    let timer = 0
    const index = () => Math.round(el.scrollLeft / Math.max(1, el.clientWidth))
    const onStart = () => {
      start = index()
    }
    const settle = () => {
      if (start == null) return
      const now = index()
      if (Math.abs(now - start) > 1) el.scrollTo({ left: (start + Math.sign(now - start)) * el.clientWidth, behavior: 'smooth' })
      start = null
    }
    const onScroll = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(settle, 120)
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.clearTimeout(timer)
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('scroll', onScroll)
    }
  }, [ref])
}
