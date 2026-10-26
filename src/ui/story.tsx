import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Link } from 'react-router-dom'
import { CarPhoto, usePhotoId } from './CarPhoto'
import { carPath } from './components'
import { fmtNum } from './format'
import { NAV_ICONS, StrokeIcon } from './icons'
import { useSwipePager } from './useSwipePager'

/**
 * Bausteine für Rückblicke im Story-Format (Jahresrückblick, Wettkampf-Rückblick): Karten mit
 * großen Zahlen, die beim Erscheinen hochzählen, Konfetti und seitliches Blättern.
 */

/** Hintergründe der Karten – je Karte ein eigener Farbton, Text bleibt hell */
export const BG = [
  'linear-gradient(160deg, #1F3A2A 0%, #14181D 70%)',
  'linear-gradient(160deg, #2E2347 0%, #14181D 70%)',
  'linear-gradient(160deg, #3A2A12 0%, #14181D 70%)',
  'linear-gradient(160deg, #10303A 0%, #14181D 70%)',
  'linear-gradient(160deg, #3A1B22 0%, #14181D 70%)',
]
export const CONFETTI = ['#F6C83C', '#3BBC4A', '#FF5A4E', '#4AA8F0', '#AE6DEE', '#F6C83C', '#EE9E10', '#FFFFFF', '#FF5A4E', '#3BBC4A']

export const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Wird true, sobald das Element (zur Hälfte) sichtbar ist – bleibt dann true */
export function useInView<T extends Element>(ref: RefObject<T | null>): boolean {
  // Ohne IntersectionObserver gleich sichtbar
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    const el = ref.current
    if (!el || seen) return
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setSeen(true), { threshold: 0.5 })
    io.observe(el)
    return () => io.disconnect()
  }, [ref, seen])
  return seen
}

/** Zahl, die beim Erscheinen hochzählt */
export function CountUp({ value, format = (v) => fmtNum(v, 0), duration = 900 }: { value: number; format?: (v: number) => string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const seen = useInView(ref)
  const [shown, setShown] = useState(reduced() ? value : 0)
  useEffect(() => {
    // Mit reduzierter Bewegung steht die Zahl von Anfang an
    if (!seen || reduced()) return
    let raf = 0
    const t0 = performance.now()
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / duration)
      setShown(value * (1 - Math.pow(1 - p, 3)))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [seen, value, duration])
  return (
    <span ref={ref} aria-label={format(value)}>
      <span aria-hidden="true">{format(shown)}</span>
    </span>
  )
}

/** Inhalt blendet beim Erscheinen von unten ein (Diagramme „wachsen“) */
export function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const seen = useInView(ref)
  return (
    <div ref={ref} className={`wr-reveal${seen ? ' in' : ''}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  )
}

/** Kurzes Konfetti, sobald die Karte sichtbar ist */
export function Confetti() {
  const ref = useRef<HTMLSpanElement>(null)
  const seen = useInView(ref)
  return (
    <span ref={ref} aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {seen &&
        !reduced() &&
        CONFETTI.map((c, i) => <span key={i} className="confetti wr-confetti" style={{ left: `${6 + i * 9.5}%`, background: c, animationDelay: `${(i * 0.23) % 1.4}s` }} />)}
    </span>
  )
}

export const Huge = ({ children, color }: { children: ReactNode; color?: string }) => (
  <span className="num" style={{ fontSize: 'clamp(52px, 17vw, 76px)', fontWeight: 800, lineHeight: 0.95, letterSpacing: -1, color }}>
    {children}
  </span>
)
export const Line = ({ children }: { children: ReactNode }) => <span style={{ fontSize: 16, color: 'var(--text-2)', lineHeight: 1.45 }}>{children}</span>
export const Hint = ({ children }: { children: ReactNode }) => <span style={{ fontSize: 11, color: 'var(--muted)' }}>{children}</span>
export const Group = ({ children, gap = 8 }: { children: ReactNode; gap?: number }) => <div style={{ display: 'flex', flexDirection: 'column', gap }}>{children}</div>

export interface CardDef {
  key: string
  kicker: string
  /** Großes, blasses Symbol im Hintergrund */
  icon?: string
  confetti?: boolean
  body: ReactNode
}

export function CardFrame({ i, card, children, story }: { i: number; card: Pick<CardDef, 'kicker' | 'icon' | 'confetti'>; children: ReactNode; story?: boolean }) {
  return (
    <section
      style={{
        position: 'relative', overflow: 'hidden', background: BG[i % BG.length], border: '1px solid #262B33', borderRadius: 26, padding: story ? '26px 22px 24px' : '22px 20px',
        display: 'flex', flexDirection: 'column', gap: story ? 22 : 16, boxShadow: 'var(--sh2)',
        ...(story ? { minHeight: 'min(74vh, 660px)', justifyContent: 'space-between' } : {}),
      }}
    >
      {card.icon && (
        <span aria-hidden="true" style={{ position: 'absolute', right: -40, bottom: -40, opacity: 0.07, pointerEvents: 'none' }}>
          <StrokeIcon d={card.icon} size={240} color="#FFFFFF" width={1.4} />
        </span>
      )}
      {card.confetti && <Confetti />}
      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2.5, textTransform: 'uppercase', color: 'var(--text-2)', position: 'relative' }}>{card.kicker}</span>
      {children}
    </section>
  )
}

/** Kachel für die Startkarte */
export function StatTile({ value, label, format }: { value: number | string; label: string; format?: (v: number) => string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span className="num" style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.05 }}>{typeof value === 'number' ? <CountUp value={value} format={format} /> : value}</span>
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>{label}</span>
    </div>
  )
}


/** Großes Fahrzeugfoto (oder Symbol) über die ganze Breite */
export function CarHero({ car }: { car: string }) {
  const photo = usePhotoId(car)
  const icon = (
    <span style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
      <StrokeIcon d={NAV_ICONS.cars} size={96} color="#5B6573" width={1.4} />
    </span>
  )
  return (
    <Link to={carPath(car)} style={{ display: 'block', width: '100%', height: 170, borderRadius: 18, overflow: 'hidden', background: 'rgba(255,255,255,0.05)' }}>
      {photo ? <CarPhoto key={photo} fileId={photo} alt={car} width={900} fallback={icon} /> : icon}
    </Link>
  )
}

/**
 * Story-Ansicht: Karten im Vollbild einzeln durchwischen (Pfeiltasten gehen auch). `auto` blättert
 * selbst weiter (Millisekunden je Karte, am Ende wieder von vorn) – für die Leinwand.
 */
export function StoryPager({ cards, label, onDone, auto, doneLabel = 'Zur Übersicht' }: { cards: CardDef[]; label: string; onDone: () => void; auto?: number; doneLabel?: string }) {
  const total = cards.length
  const { index, go, viewportProps, trackProps } = useSwipePager(total)
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(index + 1)
      else if (e.key === 'ArrowLeft') go(index - 1)
      else if (e.key === 'Escape') onDone()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  // Selbst weiterblättern: der Zeitgeber hängt nur an der Karte, nicht an jedem Neuzeichnen der Seite dahinter
  const goRef = useRef(go)
  useEffect(() => {
    goRef.current = go
  })
  useEffect(() => {
    if (!auto) return
    const t = setTimeout(() => goRef.current(index + 1 < total ? index + 1 : 0), auto)
    return () => clearTimeout(t)
  }, [auto, index, total])
  const last = index === total - 1
  const slide = { flex: '0 0 100%', minWidth: 0, minHeight: 0, padding: '14px max(16px, env(safe-area-inset-left, 0px))', display: 'flex', flexDirection: 'column', overflowY: 'auto', overflowX: 'hidden', touchAction: 'pan-y', overscrollBehavior: 'contain' } as const
  return (
    <div role="dialog" aria-modal="true" aria-label={label} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'var(--bg)', display: 'flex', flexDirection: 'column', paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div style={{ display: 'flex', gap: 4, padding: '12px 16px 0' }}>
        {Array.from({ length: total }, (_, i) => (
          <span key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= index ? '#F2F4F5' : '#3A404A', transition: 'background .2s' }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px 0' }}>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          {index + 1} / {total}
        </span>
        <button className="btn round" onClick={onDone} style={{ minHeight: 34, fontSize: 13 }}>
          {auto ? 'Schließen' : 'Überspringen'}
        </button>
      </div>
      <div {...viewportProps} style={{ ...viewportProps.style, flex: 1, minHeight: 0, display: 'flex' }}>
        <div {...trackProps} style={{ ...trackProps.style, flex: '0 0 100%', width: '100%', minWidth: 0, minHeight: 0 }}>
          {cards.map((c, i) => (
            // Eigene Scrollfläche: pan-y hier noch einmal, sonst übernimmt der Browser auch waagerechte Wische
            <div key={c.key} style={slide}>
              <div style={{ maxWidth: auto ? 760 : 520, width: '100%', margin: 'auto' }}>
                <CardFrame i={i} card={c} story>
                  {c.body}
                </CardFrame>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 16px 14px', gap: 10 }}>
        <button className="btn round" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Vorherige Karte" style={{ opacity: index === 0 ? 0.4 : 1 }}>
          ‹ Zurück
        </button>
        <button className="btn round" onClick={() => (last ? onDone() : go(index + 1))} style={{ background: '#F2F4F5', color: '#14181D', border: 'none', fontWeight: 700 }}>
          {last ? doneLabel : 'Weiter ›'}
        </button>
      </div>
    </div>
  )
}

/** Banner zu einem Rückblick (Saison: „Dein Jahr“, Wettkampf); grün hinterlegt, wenn es um einen selbst geht */
export function RecapLink({ to, title, sub, mine }: { to: string; title: string; sub: string; mine?: boolean }) {
  return (
    <Link to={to} className={`card${mine ? ' me-row' : ''}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <span style={{ fontSize: 26 }} aria-hidden="true">
        ✦
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>{title}</span>
        <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{sub}</span>
      </span>
      <span aria-hidden="true">›</span>
    </Link>
  )
}
