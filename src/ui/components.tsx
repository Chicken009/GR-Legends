import { createContext, useContext, useEffect, useId, useRef, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import type { AppData } from '../data/useRaceDays'
import { nameKey } from '../data/settings'
import { PLACEMENT_RUNS } from '../domain/model'
import { StrokeIcon } from './icons'
import { initials } from './format'
import { useMe } from './me'

export const DataContext = createContext<AppData | null>(null)

export function useData(): AppData {
  const data = useContext(DataContext)
  if (!data) throw new Error('useData außerhalb von DataContext')
  return data
}

/** Eigener Fahrername, falls er im Datenstand vorkommt */
export function useMyName(): string | null {
  const { me } = useMe()
  const { model, settings } = useData()
  if (!me) return null
  if (model.drivers.includes(me)) return me
  // Früher gewählter Name (z. B. Initialen), der inzwischen einen Anzeigenamen hat
  const alias = settings.aliases[nameKey(me)]
  return alias && model.drivers.includes(alias) ? alias : null
}

export const enc = (name: string) => encodeURIComponent(name)
export const driverPath = (name: string) => `/fahrer/${enc(name)}`
export const carPath = (name: string) => `/autos/${enc(name)}`

export function Avatar({ name, size = 30, ring, style }: { name: string; size?: number; ring?: string; style?: CSSProperties }) {
  return (
    <span
      className="avatar"
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36), border: ring ? `${size > 40 ? 3 : 2}px solid ${ring}` : undefined, ...style }}
    >
      {initials(name)}
    </span>
  )
}

/** Mit gewähltem Namen: eigenes Profil öffnen (dort lässt sich der Fahrer wechseln), sonst die Auswahl */
export function useOpenMe() {
  const { openPicker } = useMe()
  const me = useMyName()
  const navigate = useNavigate()
  const location = useLocation()
  return () => {
    if (!me) return openPicker()
    if (decodeURIComponent(location.pathname) === driverPath(me)) return
    navigate(driverPath(me), { state: { bg: location } })
  }
}

/** Runder Knopf oben rechts: eigenes Profil bzw. „Wer bist du?“ */
export function MeButton() {
  const openMe = useOpenMe()
  const me = useMyName()
  return (
    <button className={`me-btn${me ? '' : ' empty'}`} onClick={openMe} aria-label={me ? `Mein Profil: ${me}` : 'Wer bist du? Fahrer auswählen'}>
      {me ? initials(me) : <StrokeIcon d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.6-6 8-6s8 2 8 6" size={20} color="#9AA3AD" />}
    </button>
  )
}

export function PageHead({ title, kicker, color, children }: { title: string; kicker?: string; color?: string; children?: ReactNode }) {
  return (
    <header className="page-head">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        {kicker && <span className="kicker">{kicker}</span>}
        <h1 style={{ color }}>{title}</h1>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {children}
        <span className="hide-desktop">
          <MeButton />
        </span>
      </div>
    </header>
  )
}

/** Zeitraum: Gesamt oder ein Jahr */
export function PeriodTabs({ value, onChange, years }: { value: string; onChange: (v: string) => void; years: string[] }) {
  const opts = [['all', 'Gesamt'], ...years.map((y) => [y, y])]
  return (
    <div role="tablist" aria-label="Zeitraum" className="tabs">
      {opts.map(([v, label]) => (
        <button key={v} role="tab" aria-selected={value === v} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  )
}

export function Segment<T extends string>({ value, onChange, options, label, small }: { value: T; onChange: (v: T) => void; options: [T, string][]; label: string; small?: boolean }) {
  return (
    <div role="tablist" aria-label={label} className={`segment${small ? ' small' : ''}`}>
      {options.map(([v, text]) => (
        <button key={v} role="tab" aria-selected={value === v} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  )
}

/** Umschalter Liste / Kacheln */
export function ViewToggle({ value, onChange }: { value: 'table' | 'cards'; onChange: (v: 'table' | 'cards') => void }) {
  return (
    <div role="group" aria-label="Ansicht" className="segment view-toggle">
      <button aria-pressed={value === 'table'} aria-label="Liste" onClick={() => onChange('table')}>
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      <button aria-pressed={value === 'cards'} aria-label="Kacheln" onClick={() => onChange('cards')}>
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  )
}

export function Tile({ value, label, color }: { value: ReactNode; label: string; color?: string }) {
  return (
    <div className="tile">
      <span className="v" style={{ color }}>
        {value}
      </span>
      <span className="l">{label}</span>
    </div>
  )
}

export function Rank({ rank, size = 16, style }: { rank: number; size?: number; style?: CSSProperties }) {
  return (
    <span className={`rank${rank <= 3 ? ` r${rank}` : ''}`} style={{ fontSize: size, minWidth: size * 1.3, ...style }}>
      {rank}
    </span>
  )
}

/** Panel, das von unten hereinfährt (Profil, Auswahl). Schließt mit Esc, Tipp daneben oder Runterziehen. */
export function Sheet({ onClose, children, actions, label }: { onClose: () => void; children: ReactNode; actions?: ReactNode; label: string }) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ startY: number; startT: number; dy: number } | null>(null)
  const closing = useRef(false)

  const id = useId()
  useEffect(() => {
    // Mehrere Panels übereinander: Esc schließt nur das oberste
    sheetStack.push(id)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && sheetStack[sheetStack.length - 1] === id && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      sheetStack.splice(sheetStack.indexOf(id), 1)
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose, id])

  // Ziehen: Panel folgt dem Finger, Hintergrund wird heller; weit oder schnell genug → schließen
  const begin = (y: number) => {
    if (closing.current) return
    drag.current = { startY: y, startT: performance.now(), dy: 0 }
    if (sheetRef.current) sheetRef.current.style.transition = 'none'
  }
  const move = (y: number) => {
    const d = drag.current
    if (!d || !sheetRef.current) return
    d.dy = Math.max(0, y - d.startY)
    sheetRef.current.style.transform = `translateY(${d.dy}px)`
    if (backdropRef.current) backdropRef.current.style.backgroundColor = `rgba(7, 8, 10, ${0.7 * Math.max(0, 1 - d.dy / 400)})`
  }
  const end = () => {
    const d = drag.current
    drag.current = null
    const sheet = sheetRef.current
    if (!d || !sheet) return
    const speed = d.dy / Math.max(1, performance.now() - d.startT)
    sheet.style.transition = 'transform 0.22s ease-out'
    if (d.dy > 120 || (d.dy > 30 && speed > 0.6)) {
      closing.current = true
      sheet.style.transform = 'translateY(100%)'
      if (backdropRef.current) backdropRef.current.style.backgroundColor = 'rgba(7, 8, 10, 0)'
      setTimeout(onClose, 200)
    } else {
      sheet.style.transform = ''
      if (backdropRef.current) backdropRef.current.style.backgroundColor = ''
    }
  }

  // Auch der Inhalt lässt sich runterziehen, wenn er ganz oben steht
  useEffect(() => {
    const body = bodyRef.current
    if (!body) return
    let startY = 0
    let startX = 0
    let active = false
    let horizontal = false
    const onStart = (e: TouchEvent) => {
      if (!e.touches[0]) return
      startY = e.touches[0].clientY
      startX = e.touches[0].clientX
      active = false
      horizontal = false
    }
    const onMove = (e: TouchEvent) => {
      if (!e.touches[0]) return
      const y = e.touches[0].clientY
      const dx = Math.abs(e.touches[0].clientX - startX)
      // Seitliches Wischen (Tipps, Tabellen) schließt das Panel nicht
      if (!active && dx > 8 && dx > Math.abs(y - startY)) horizontal = true
      if (!active && !horizontal && body.scrollTop <= 0 && y - startY > 6 && y - startY > dx) {
        active = true
        begin(startY)
      }
      if (active) {
        e.preventDefault()
        move(y)
      }
    }
    const onEnd = () => {
      if (active) end()
      active = false
    }
    body.addEventListener('touchstart', onStart, { passive: true })
    body.addEventListener('touchmove', onMove, { passive: false })
    body.addEventListener('touchend', onEnd)
    body.addEventListener('touchcancel', onEnd)
    return () => {
      body.removeEventListener('touchstart', onStart)
      body.removeEventListener('touchmove', onMove)
      body.removeEventListener('touchend', onEnd)
      body.removeEventListener('touchcancel', onEnd)
    }
  })

  // Über ein Portal direkt in <body>, damit Panels auch in anderen Panels richtig liegen
  return createPortal(
    <div ref={backdropRef} className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={sheetRef} className="sheet" role="dialog" aria-modal="true" aria-label={label}>
        <div
          className="sheet-handle"
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest('button, a, select')) return
            e.currentTarget.setPointerCapture(e.pointerId)
            begin(e.clientY)
          }}
          onPointerMove={(e) => move(e.clientY)}
          onPointerUp={end}
          onPointerCancel={end}
        >
          <div className="grip" aria-hidden="true">
            <span />
          </div>
          {/* Schließen per Runterziehen, Tipp daneben oder Esc; der Knopf ist nur für Screenreader */}
          <button className="sr-only" onClick={onClose}>
            Schließen
          </button>
          {actions && (
            <div className="sheet-bar">
              <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>{actions}</div>
            </div>
          )}
        </div>
        <div ref={bodyRef} className="sheet-body">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** Offene Panels und Pop-ups, oben = zuletzt geöffnet (Esc schließt nur das oberste) */
export const sheetStack: string[] = []

/** Neue Fahrer: statt Elo-Zahl und Veränderung nur der Fortschritt der Einstufung */
export function Placement({ n, size = 12, short }: { n: number; size?: number; short?: boolean }) {
  return (
    <span title="Die ersten Läufe dienen der Einstufung – die Wertung pendelt sich erst ein" style={{ fontSize: size, fontWeight: 600, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
      {short ? 'Einst.' : 'Einstufung'} {n}/{PLACEMENT_RUNS}
    </span>
  )
}

/** Hinweis auf Einträge im Einstellungen-Sheet, die zu keinem Rennen passen (meist Tippfehler) */
export function SettingsHint({ names, kind }: { names: string[]; kind: 'Fahrer' | 'Fahrzeug' }) {
  if (!names.length) return null
  return (
    <p className="inner" style={{ margin: 0, padding: '10px 12px', fontSize: 12, color: 'var(--muted)', lineHeight: 1.45 }}>
      <b style={{ color: 'var(--text-2)' }}>Einstellungen-Sheet:</b> {names.length === 1 ? `Dieser ${kind}name kommt` : `Diese ${kind}namen kommen`} in keinem Rennen vor – bitte die Schreibweise mit Smartrace vergleichen: {names.map((n) => `„${n}“`).join(', ')}
    </p>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="muted" style={{ margin: 0, fontSize: 13 }}>{children}</p>
}

/** GR-Monogramm (Vektor aus dem Logo) */
export function Monogram({ width = 56, color = '#F2F4F5' }: { width?: number; color?: string }) {
  return (
    <svg width={width} height={(width * 160) / 286} viewBox="304 352 286 160" aria-hidden="true">
      <g fill={color}>
        <path d="M441.12 431.1c0 31.99-25.93 57.92-57.92 57.92s-57.92-25.93-57.92-57.92 25.93-57.92 57.92-57.92h3" fill="none" stroke={color} strokeWidth="27.7" />
        <rect x="383.2" y="359.33" width="156.49" height="27.7" />
        <rect x="381.1" y="417.25" width="73.87" height="27.7" />
        <rect x="427.27" y="429.1" width="27.7" height="75.87" />
        <rect x="484.15" y="417.25" width="28.7" height="85.62" />
        <path d="M536.55 373.18h3c15.99 0 28.96 12.97 28.96 28.96s-12.97 28.96-28.96 28.96h-3" fill="none" stroke={color} strokeWidth="27.7" />
        <rect x="510.85" y="417.25" width="29.7" height="28.7" />
        <path d="M510.8 443.95l37.91 58.92h32.94l-37.91-58.92z" />
        <circle cx="381.1" cy="431.1" r="13.85" />
      </g>
    </svg>
  )
}

/** Schriftzug: Monogramm + LEGENDS (Variante D) */
export function Wordmark({ width = 150 }: { width?: number }) {
  return (
    <svg width={width} height={(width * 150) / 300} viewBox="0 30 300 140" role="img" aria-label="GR Legends">
      <svg x="70" y="22" width="160" height="90" viewBox="304 352 286 160">
        <g fill="#F2F4F5">
          <path d="M441.12 431.1c0 31.99-25.93 57.92-57.92 57.92s-57.92-25.93-57.92-57.92 25.93-57.92 57.92-57.92h3" fill="none" stroke="#F2F4F5" strokeWidth="27.7" />
          <rect x="383.2" y="359.33" width="156.49" height="27.7" />
          <rect x="381.1" y="417.25" width="73.87" height="27.7" />
          <rect x="427.27" y="429.1" width="27.7" height="75.87" />
          <rect x="484.15" y="417.25" width="28.7" height="85.62" />
          <path d="M536.55 373.18h3c15.99 0 28.96 12.97 28.96 28.96s-12.97 28.96-28.96 28.96h-3" fill="none" stroke="#F2F4F5" strokeWidth="27.7" />
          <rect x="510.85" y="417.25" width="29.7" height="28.7" />
          <path d="M510.8 443.95l37.91 58.92h32.94l-37.91-58.92z" />
          <circle cx="381.1" cy="431.1" r="13.85" />
        </g>
      </svg>
      <rect x="44" y="146" width="22" height="4" rx="2" fill="#3BBC4A" />
      <text x="153" y="157" textAnchor="middle" fill="#F2F4F5" fontFamily="Rubik, Arial, sans-serif" fontSize="26" fontWeight="800" letterSpacing="10">
        LEGENDS
      </text>
      <rect x="234" y="146" width="22" height="4" rx="2" fill="#3BBC4A" />
    </svg>
  )
}
