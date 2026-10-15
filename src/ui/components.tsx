import { createContext, useContext, useEffect, type CSSProperties, type ReactNode } from 'react'
import type { AppData } from '../data/useRaceDays'
import { ChevronDown, StrokeIcon } from './icons'
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
  const { model } = useData()
  return me && model.drivers.includes(me) ? me : null
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

/** Runder Knopf oben rechts: „Das bin ich“ */
export function MeButton() {
  const { openPicker } = useMe()
  const me = useMyName()
  return (
    <button className={`me-btn${me ? '' : ' empty'}`} onClick={openPicker} aria-label={me ? `Das bin ich: ${me} – ändern` : 'Wer bist du? Fahrer auswählen'}>
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

/** Panel, das von unten hereinfährt (Profil, Auswahl). Schließt mit Esc oder Tipp daneben. */
export function Sheet({ onClose, children, actions, label }: { onClose: () => void; children: ReactNode; actions?: ReactNode; label: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])
  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label}>
        <div className="grip">
          <span />
        </div>
        <div className="sheet-bar">
          <button className="icon-btn" aria-label="Schließen" onClick={onClose}>
            <ChevronDown />
          </button>
          <div style={{ display: 'flex', gap: 4 }}>{actions}</div>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
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
