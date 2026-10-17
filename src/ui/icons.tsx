import { useId, type CSSProperties, type ReactNode } from 'react'
import type { Status } from '../domain/model'

/** Metall-Verläufe, einmal pro Seite eingebunden (siehe Layout). */
export function GradientDefs() {
  return (
    <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
      <defs>
        <linearGradient id="gGold" x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor="#FFF6C2" />
          <stop offset="0.3" stopColor="#FFD84D" />
          <stop offset="0.6" stopColor="#E5A51A" />
          <stop offset="0.82" stopColor="#B57A06" />
          <stop offset="1" stopColor="#F2C94C" />
        </linearGradient>
        <linearGradient id="gSilver" x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="0.35" stopColor="#D9E1E8" />
          <stop offset="0.65" stopColor="#9AA7B4" />
          <stop offset="0.85" stopColor="#6F7D8B" />
          <stop offset="1" stopColor="#C9D3DC" />
        </linearGradient>
        <linearGradient id="gBronze" x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor="#FFD9B8" />
          <stop offset="0.35" stopColor="#E39A62" />
          <stop offset="0.65" stopColor="#B0642C" />
          <stop offset="0.85" stopColor="#7A3E15" />
          <stop offset="1" stopColor="#D88A55" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export const PATHS = {
  flame:
    'M12 1.5c.7 3.3-1.1 4.9-2.6 6.6C7.9 9.8 6 11.9 6 15.2a6 6 0 0 0 12 0c0-2.7-1.3-4.7-2.7-6.3.2 1.6-.5 2.9-1.6 3.3.6-3.9-.6-7.8-1.7-10.7z',
  trophy:
    'M6.5 2.5h11v1.8h2.8c.6 0 1 .4 1 1v1.4a4.2 4.2 0 0 1-4.3 4.2 5.5 5.5 0 0 1-3.7 3V17h2.6c.8 0 1.4.6 1.4 1.4v2.6H6.7v-2.6c0-.8.6-1.4 1.4-1.4h2.6v-3.1a5.5 5.5 0 0 1-3.7-3A4.2 4.2 0 0 1 2.7 6.7V5.3c0-.6.4-1 1-1h2.8zM4.6 6.2v.5c0 1 .7 1.9 1.7 2.2-.1-.5-.2-1-.2-1.5V6.2zM19.4 6.2h-1.5v1c0 .5-.1 1-.2 1.5 1-.3 1.7-1.2 1.7-2.2z',
  bolt: 'M13.8 1.8L4.6 13.4c-.4.5 0 1.2.6 1.2h5.6l-1.2 7c-.1.6.7 1 1.1.5l9-11.7c.4-.5 0-1.2-.6-1.2h-5.6l1.4-6.8c.1-.6-.7-.9-1.1-.6z',
  // kursive Acht als Rennstrecke, mit Start-Ziel-Linie
  track: 'M 12.0 12.0 C 16.0 10.4 17.7 7.6 17.0 5.2 C 16.2 3.0 12.7 2.6 10.7 4.6 C 8.7 6.6 8.9 9.8 12.0 12.0 C 15.2 14.4 15.4 17.6 13.3 19.8 C 11.1 21.9 7.1 21.9 6.3 19.6 C 5.5 17.4 7.4 14.4 12.0 12.0 Z M5.3 17.4L8.2 16.8',
  road: 'M9.2 2h5.6l5.4 20H3.8zM11.2 5v3h1.6V5zM11 11v3.4h2V11zM10.8 17.2v3.4h2.4v-3.4z',
  clock: 'M12 2.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19zM11 6.5v6.2l4.3 2.6 1-1.6-3.3-2V6.5z',
  sword:
    'M21.6 2.4l-.5 3.9L10.4 17 7 13.6 17.7 2.9zM4.6 11.6l1.6-1.6 7.8 7.8-1.6 1.6zM6.6 15.8l-4.2 4.2a1.1 1.1 0 0 0 1.6 1.6l4.2-4.2z',
  people:
    'M9 3.5a3.8 3.8 0 1 1 0 7.6 3.8 3.8 0 0 1 0-7.6zM2 20.5c0-4 3-6.6 7-6.6s7 2.6 7 6.6zM16.5 4.2a3.3 3.3 0 1 1 0 6.6c-.6 0-1.1-.1-1.6-.4a5.6 5.6 0 0 0 0-5.8c.5-.3 1-.4 1.6-.4zM17.5 13.4c2.9.4 4.5 2.6 4.5 7.1h-4.2c0-2.6-.9-4.8-2.5-6.3.7-.5 1.4-.8 2.2-.8z',
  flag: 'M5 21.5V3h2v1.2c3.4-1.3 6.1 1.4 11.5.2v10c-5.4 1.2-8.1-1.5-11.5-.2v7.3z',
  target: 'M12 2.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19zm0 4a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zm0 3a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z',
  shield:
    'M12 3.3l7.4 2.6c.4.1.6.5.6.9v4.5c0 4.3-3.2 7.4-7.6 9.3a1.2 1.2 0 0 1-.8 0C7.2 18.7 4 15.6 4 11.3V6.8c0-.4.2-.8.6-.9z',
  car: 'M2.5 15.5v-3.2c0-.8.5-1.4 1.2-1.6l3.6-1 2.6-2.6c.4-.4.9-.6 1.4-.6h4.4c.6 0 1.1.3 1.4.7l1.9 2.6 1.8.4c.9.2 1.5 1 1.5 1.9v3.4h-2.1a2.9 2.9 0 0 0-5.6 0H8.2a2.9 2.9 0 0 0-5.6 0zM5.4 14a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM17.4 14a2 2 0 1 1 0 4 2 2 0 0 1 0-4z',
  star: 'M12 2.2l2.9 6.2 6.8.8-5 4.6 1.3 6.7L12 17.2l-6 3.3 1.3-6.7-5-4.6 6.8-.8z',
  chevrons: 'M12 2.5l8.5 8.5-2.6 2.6L12 7.7l-5.9 5.9L3.5 11zM12 10.5l8.5 8.5-2.6 2.6L12 15.7l-5.9 5.9L3.5 19z',
}

export const NAV_ICONS = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  drivers: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.6-6 8-6s8 2 8 6',
  cars: 'M22.2 17.6h-3M14.6 17.2h-5.4M20.4 15.4l-3.8-2.2h-5.4l-1.9-1.6h-3.5l-.9-3.6h-3.2v7.4M12.4 13.2c-.5-1-1.4-1.7-2.5-1.7M17.4 14.5a2.6 2.6 0 1 1-.01 0M6.6 14.5a2.6 2.6 0 1 1-.01 0',
  history: 'M9 6h11M9 12h11M9 18h11M4 6h1M4 12h1M4 18h1',
  stats: 'M6 20V10M12 20V4M18 20v-7M3 20h18',
  season: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H5v1a3 3 0 0 0 3 3M16 6h3v1a3 3 0 0 1-3 3M12 13v4M9 20h6M10 17h4',
  races: 'M5 21V4M5 4h12l-2.5 4L17 12H5',
  /** Siegerpodest */
  events: 'M3 20h18M4 20v-5h5v5M9.5 20V9h5v11M15 20v-7h5v7M12 3.5l.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2L9.1 5.6l2-.3z',
}

/** Kleine Symbole für Rennleitungs-Knöpfe */
export const TOOL_ICONS = {
  plus: 'M12 5v14M5 12h14',
  pencil: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
}

export function StrokeIcon({ d, size = 22, color = 'currentColor', width = 2 }: { d: string; size?: number; color?: string; width?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export const ChevronLeft = ({ color = 'currentColor' }: { color?: string }) => <StrokeIcon d="M15 6l-6 6 6 6" color={color} width={2.2} />
export const ChevronRight = ({ color = '#9AA3AD', size = 16 }: { color?: string; size?: number }) => <StrokeIcon d="M9 6l6 6-6 6" color={color} size={size} />
export const ChevronDown = () => <StrokeIcon d="M6 9l6 6 6-6" color="#9AA3AD" size={20} />
export const ShareIcon = () => <StrokeIcon d="M12 15V3M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" size={18} />
export const SearchIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="11" cy="11" r="7" fill="none" stroke="#9AA3AD" strokeWidth="2" />
    <path d="M20 20l-4-4" stroke="#9AA3AD" strokeWidth="2" strokeLinecap="round" />
  </svg>
)
export const BulbIcon = ({ color }: { color: string }) => (
  <StrokeIcon d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.9V16h5v-.2c0-.8.4-1.5 1-1.9A6 6 0 0 0 12 3z" color={color} />
)

type IconProps = { size?: number; label?: string; animate?: boolean; style?: CSSProperties }

function Svg({ size = 20, label, children, style, viewBox = '0 0 24 24', width }: IconProps & { children: ReactNode; viewBox?: string; width?: number }) {
  return (
    <svg
      width={width ?? size}
      height={size}
      viewBox={viewBox}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className="icon-shadow"
      style={{ flexShrink: 0, overflow: 'visible', ...style }}
    >
      {label && <title>{label}</title>}
      {children}
    </svg>
  )
}

/** Glanz-Streifen über einer Form */
function Sweep({ clip, color = '#FFF6D6', opacity = 0.8 }: { clip: string; color?: string; opacity?: number }) {
  return (
    <g clipPath={`url(#${clip})`}>
      <rect className="sweep" x="3" y="0" width="5" height="24" fill={color} opacity={opacity} />
    </g>
  )
}

/** Flamme mit Zahl als Aussparung (Siegesserie). Unter 28 px stehen zwei Ziffern daneben. */
export function Flame({ value, size = 20, label, animate }: IconProps & { value?: number }) {
  const id = useId()
  const text = value != null ? String(value) : ''
  const inside = text.length === 1 ? size >= 16 : text.length === 2 && size >= 28
  if (text && !inside) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }} role="img" aria-label={label}>
        <Svg size={size * 0.8}>
          <path fill="#FF7A2F" d={PATHS.flame} />
        </Svg>
        <span style={{ fontSize: Math.max(11, size * 0.6), fontWeight: 700, color: '#FF9A5C' }}>{text}</span>
      </span>
    )
  }
  return (
    <Svg size={size} label={label}>
      <defs>
        <mask id={id}>
          <rect width="24" height="24" fill="#fff" />
          <text x="12" y={text.length > 1 ? 18.6 : 19} textAnchor="middle" fontFamily="Rubik" fontWeight="800" fontSize={text.length > 1 ? 7.2 : 9} letterSpacing={text.length > 1 ? -0.3 : 0} fill="#000">
            {text}
          </text>
        </mask>
      </defs>
      <path className={animate ? 'flick' : undefined} mask={`url(#${id})`} fill="#FF7A2F" d={PATHS.flame} />
    </Svg>
  )
}

/** 1 Chevron = 1 Platz aufgestiegen; ab 5 drei Chevrons plus Zahl. */
export function Chevrons({ value, size = 22, color = '#3BBC4A', label, className }: IconProps & { value: number; color?: string; className?: string }) {
  const n = Math.max(1, value)
  const paths: Record<number, [string, number]> = {
    1: ['M2 12l4-4 4 4', 2.4],
    2: ['M2 9l4-4 4 4M2 15l4-4 4 4', 2.4],
    3: ['M2 6.5l4-4 4 4M2 11.5l4-4 4 4M2 16.5l4-4 4 4', 2.2],
    4: ['M2 5l4-3.6L10 5M2 9.3l4-3.6 4 3.6M2 13.6l4-3.6 4 3.6M2 17.9l4-3.6 4 3.6', 2],
  }
  const [d, w] = paths[Math.min(n, n >= 5 ? 3 : 4)]
  const svg = (
    <Svg size={size} width={size * 0.6} viewBox="0 0 12 20" label={n >= 5 ? undefined : label}>
      <path className={className} d={d} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
  if (n < 5) return svg
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }} role="img" aria-label={label}>
      {svg}
      <span style={{ fontSize: Math.max(12, size * 0.65), fontWeight: 700, color }}>{n}</span>
    </span>
  )
}

export function Crown({ size = 20, label = 'Platz 1 der Wertung', animate }: IconProps) {
  const id = useId()
  return (
    <Svg size={size} label={label}>
      <defs>
        <clipPath id={id}>
          <path d="M3 7.5l4.6 4L12 4l4.4 7.5L21 7.5 19.3 17.5H4.7z" />
          <rect x="4.7" y="18.7" width="14.6" height="2.4" rx="1.2" />
        </clipPath>
      </defs>
      <path fill="url(#gGold)" d="M3 7.5l4.6 4L12 4l4.4 7.5L21 7.5 19.3 17.5H4.7z" />
      <rect x="4.7" y="18.7" width="14.6" height="2.4" rx="1.2" fill="url(#gGold)" />
      <circle cx="3" cy="7" r="1.5" fill="url(#gGold)" />
      <circle cx="12" cy="3.6" r="1.5" fill="url(#gGold)" />
      <circle cx="21" cy="7" r="1.5" fill="url(#gGold)" />
      {animate && <Sweep clip={id} />}
    </Svg>
  )
}

export function Trophy({ size = 20, label, metal = 'gGold' }: IconProps & { metal?: 'gGold' | 'gSilver' | 'gBronze' }) {
  return (
    <Svg size={size} label={label}>
      <path d={PATHS.trophy} fill={`url(#${metal})`} />
    </Svg>
  )
}

const METAL = { gold: ['gGold', '#FFF6D6'], silver: ['gSilver', '#FFFFFF'], bronze: ['gBronze', '#FFE3CC'] } as const

/** Metallene Flamme mit Uhrzeigern: Strecken- (Gold), Fahrzeug- (Silber), persönlicher Rekord (Bronze). */
export function RecordFlame({ metal, size = 20, label, animate = true }: IconProps & { metal: keyof typeof METAL }) {
  const id = useId()
  const [grad, shine] = METAL[metal]
  return (
    <Svg size={size} label={label}>
      <defs>
        <mask id={`${id}m`}>
          <rect width="24" height="24" fill="#fff" />
          <path d="M12 11.6v4l2.6 1.5" fill="none" stroke="#000" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </mask>
        <clipPath id={`${id}c`}>
          <path d={PATHS.flame} />
        </clipPath>
      </defs>
      <path className={animate ? 'flick' : undefined} mask={`url(#${id}m)`} d={PATHS.flame} fill={`url(#${grad})`} />
      {animate && <Sweep clip={`${id}c`} color={shine} />}
    </Svg>
  )
}

export function Sword({ size = 20, label }: IconProps) {
  const id = useId()
  return (
    <Svg size={size} label={label}>
      <defs>
        <mask id={id}>
          <rect width="24" height="24" fill="#fff" />
          <path d="M18.3 5.7L9.6 14.4" stroke="#000" strokeWidth="1.1" strokeLinecap="round" />
        </mask>
      </defs>
      <path mask={`url(#${id})`} d="M21.6 2.4l-.5 3.9L10.4 17 7 13.6 17.7 2.9z" fill="#DCE6EF" />
      <path d="M4.6 11.6l1.6-1.6 7.8 7.8-1.6 1.6z" fill="#FF5A4E" />
      <path d="M6.6 15.8l-4.2 4.2a1.1 1.1 0 0 0 1.6 1.6l4.2-4.2z" fill="#8B5A3C" />
      <circle cx="3.6" cy="20.4" r="1.6" fill="#FF5A4E" />
    </Svg>
  )
}

export function Bolt({ size = 20, label }: IconProps) {
  return (
    <Svg size={size} label={label}>
      <path className="zap" fill="#FFD23F" d={PATHS.bolt} />
    </Svg>
  )
}

export function Target({ size = 20, label }: IconProps) {
  const id = useId()
  return (
    <Svg size={size} label={label}>
      <defs>
        <mask id={id}>
          <rect width="24" height="24" fill="#fff" />
          <circle cx="10.5" cy="13.5" r="5.2" fill="none" stroke="#000" strokeWidth="1.8" />
        </mask>
      </defs>
      <circle mask={`url(#${id})`} cx="10.5" cy="13.5" r="8.5" fill="#5EC8FF" />
      <path d="M10.5 13.5L20.4 3.6" stroke="#F2F4F5" strokeWidth="2" strokeLinecap="round" />
      <path d="M17.4 6.6L20.4 3.6 21.8 4.9 18.6 7.6z" fill="#FF4D4D" stroke="#FF4D4D" strokeWidth="0.6" strokeLinejoin="round" />
      <path d="M17.4 6.6L20.4 3.6 19.1 2.2 16.4 5.4z" fill="#E03434" stroke="#E03434" strokeWidth="0.6" strokeLinejoin="round" />
    </Svg>
  )
}

export function Shield({ size = 20, label }: IconProps) {
  return (
    <Svg size={size} label={label}>
      <path d={PATHS.shield} fill="url(#gSilver)" />
      <path d="M12 5.6l5.6 2v3.7c0 3.2-2.3 5.6-5.6 7.1-3.3-1.5-5.6-3.9-5.6-7.1V7.6z" fill="none" stroke="#FFFFFF" strokeWidth="1" opacity="0.55" />
    </Svg>
  )
}

export function PoleFlag({ size = 20, label }: IconProps) {
  return (
    <Svg size={size} label={label}>
      <path d="M5 21.5V3" stroke="#F2F4F5" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M6.5 3.5c4-1.6 7 1.6 13 0v9.5c-6 1.6-9-1.6-13 0z" fill="#F2F4F5" />
      <path
        d="M9.7 3.2v3.3H6.5V3.5c1.2-.4 2.2-.4 3.2-.3zM16.2 4.2v3.2H13V4.4c1 .2 2 .1 3.2-.2zM13 6.5v3.3H9.7V6.5c1.1.1 2.2.2 3.3 0zM19.5 7.2v3.1h-3.3V7.4c1 0 2.1 0 3.3-.2zM9.7 9.8v3.1c-1.1-.1-2.2 0-3.2.3V9.9c1-.2 2.1-.2 3.2-.1zM16.2 10.3v3.2c-1.2.2-2.2.2-3.2 0V9.8c1 .3 2 .5 3.2.5z"
        fill="#0E1013"
      />
    </Svg>
  )
}

export function FormCurve({ size = 20, label }: IconProps) {
  return (
    <Svg size={size} label={label}>
      <path d="M3 17.5l5.2-5.2 3.8 3 7.5-7.5" fill="none" stroke="#3BBC4A" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14.5 6.8h5.7v5.7" fill="none" stroke="#3BBC4A" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

export function Rocket({ size = 20, label }: IconProps) {
  const id = useId()
  return (
    <Svg size={size} label={label}>
      <defs>
        <mask id={id}>
          <rect width="24" height="24" fill="#fff" />
          <circle cx="12" cy="9" r="1.9" fill="#000" />
        </mask>
      </defs>
      <path className="flick" d="M10.1 17.2h3.8l-.5 2.9L12 22.6l-1.4-2.5z" fill="#FFD23F" />
      <path className="flick" d="M10.8 17.2h2.4l-.4 2L12 20.8l-.8-1.6z" fill="#FF5A4E" />
      <path d="M7.6 12.2L4.6 15.6v3.3l3.4-1.7zM16.4 12.2l3 3.4v3.3L16 17.2z" fill="#E07B36" />
      <path mask={`url(#${id})`} d="M12 1.6c3 2.1 4.6 5.6 4.6 9.7v5.4a.6.6 0 0 1-.6.6H8a.6.6 0 0 1-.6-.6v-5.4c0-4.1 1.6-7.6 4.6-9.7z" fill="#FF9F5A" />
    </Svg>
  )
}

export function Rookie({ size = 20, label }: IconProps) {
  return (
    <Svg size={size} label={label}>
      <path d="M12 21.5v-8.5" stroke="#8BD86A" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M12 13.2c0-4.6 2.9-7.6 8-7.6.2 4.8-3 7.6-8 7.6zM12 15.4c0-3.7-2.4-6.1-6.5-6.1-.1 3.9 2.5 6.1 6.5 6.1z" fill="#8BD86A" />
    </Svg>
  )
}

export function Snowflake({ size = 20, label }: IconProps) {
  return (
    <Svg size={size} label={label}>
      <g className="frost" fill="none" stroke="#7CCBFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2.5v19M3.8 7.2l16.4 9.6M3.8 16.8l16.4-9.6" />
        <path d="M9.4 4.3L12 6.4l2.6-2.1M9.4 19.7L12 17.6l2.6 2.1M4.5 10.6l3.2-.6-1.1-3.1M19.5 13.4l-3.2.6 1.1 3.1M4.5 13.4l3.2.6-1.1 3.1M19.5 10.6l-3.2-.6 1.1-3.1" />
      </g>
    </Svg>
  )
}

/** Ein Status-Symbol */
export function StatusIcon({ status, size = 18, animate }: { status: Status; size?: number; animate?: boolean }) {
  const p = { size, label: status.label }
  switch (status.code) {
    case 'crown':
      return <Crown {...p} animate={animate} />
    case 'flame':
      return <Flame {...p} value={status.value} animate={animate} />
    case 'record-track':
      return <RecordFlame {...p} metal="gold" animate={animate} />
    case 'record-car':
      return <RecordFlame {...p} metal="silver" animate={animate} />
    case 'record-personal':
      return <RecordFlame {...p} metal="bronze" animate={animate} />
    case 'up':
      return <Chevrons {...p} value={status.value ?? 1} />
    case 'giant':
      return <Sword {...p} />
    case 'comeback':
      return <Rocket {...p} />
    case 'pole':
      return <PoleFlag {...p} />
    case 'precision':
      return <Target {...p} />
    case 'clean':
      return <Shield {...p} />
    case 'form':
      return <FormCurve {...p} />
    case 'rookie':
      return <Rookie {...p} />
    case 'ice':
      return <Snowflake {...p} />
    case 'hunter':
      return <Bolt {...p} />
  }
}

/** Die wichtigsten Status-Symbole (max. 3) */
export function StatusIcons({ list, size = 18, max = 3, animate }: { list?: Status[]; size?: number; max?: number; animate?: boolean }) {
  if (!list?.length) return null
  return (
    <span className="status-icons">
      {list.slice(0, max).map((s) => (
        <StatusIcon key={s.code} status={s} size={size} animate={animate} />
      ))}
    </span>
  )
}

/** Seitenansicht eines Rennwagens als Platzhalter, wenn kein Foto vorliegt */
export function CarSilhouette({ width = 270 }: { width?: number }) {
  return (
    <svg width={width} height={width * 0.37} viewBox="0 0 270 100" aria-hidden="true">
      <g transform="translate(270 0) scale(-1 1)">
        <path d="M20 78c0-6 4-10 12-11l60-9 40-10h40l30-8h30V24h18v52H20z" fill="#2A2F38" />
        <circle cx="78" cy="78" r="16" fill="#1A1E24" />
        <circle cx="214" cy="78" r="17" fill="#1A1E24" />
      </g>
    </svg>
  )
}
