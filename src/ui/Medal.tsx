import { useId } from 'react'
import type { Medal, Tier } from '../domain/model'
import { PATHS } from './icons'

interface TierStyle {
  label: string
  c1: string
  c2: string
  c3: string
  light: string
  dark: string
  edge: string
  ink: string
  text: string
  ribA: string
  ribB: string
  stripe: string
  glow: string
  shape: 'coin' | 'hex' | 'gem'
  sparkle: boolean
  aura: boolean
  rays: boolean
}

export const TIERS: Record<Tier, TierStyle> = {
  bronze: {
    label: 'Bronze', c1: '#F3B27E', c2: '#B8692F', c3: '#6E3714', light: '#FFD3AE', dark: '#4A2208', edge: '#3A1A05', ink: '#5A2B0C', text: '#E39A62',
    ribA: '#1F6B4E', ribB: '#18573F', stripe: '#E39A62', glow: '#E39A62', shape: 'coin', sparkle: false, aura: false, rays: false,
  },
  silver: {
    label: 'Silber', c1: '#FFFFFF', c2: '#B7C3CF', c3: '#6A7886', light: '#FFFFFF', dark: '#4C5966', edge: '#3A4550', ink: '#3E4A56', text: '#D3DCE4',
    ribA: '#2D4FD6', ribB: '#233FAE', stripe: '#E6ECF2', glow: '#D3DCE4', shape: 'coin', sparkle: false, aura: false, rays: false,
  },
  gold: {
    label: 'Gold', c1: '#FFF1A8', c2: '#EDB625', c3: '#A06A00', light: '#FFF8CF', dark: '#7A5200', edge: '#5C3D00', ink: '#6B4700', text: '#F6C83C',
    ribA: '#B3202B', ribB: '#8E1821', stripe: '#F6C83C', glow: '#F6C83C', shape: 'coin', sparkle: true, aura: true, rays: false,
  },
  platinum: {
    label: 'Platin', c1: '#FFFFFF', c2: '#CFE3EE', c3: '#7F9DB0', light: '#FFFFFF', dark: '#55717F', edge: '#3E5662', ink: '#2F4A58', text: '#D9F0FA',
    ribA: '#5B1F8F', ribB: '#46166F', stripe: '#D9F0FA', glow: '#BFE9FF', shape: 'hex', sparkle: true, aura: true, rays: false,
  },
  diamond: {
    label: 'Diamant', c1: '#E9F8FF', c2: '#8FD3FF', c3: '#3D7FD1', light: '#FFFFFF', dark: '#2D5C99', edge: '#1F4475', ink: '#123A66', text: '#A9DEFF',
    ribA: '#0F1216', ribB: '#262B33', stripe: '#A9DEFF', glow: '#8FD3FF', shape: 'gem', sparkle: true, aura: true, rays: true,
  },
}

const SHAPES = {
  coin: 'M40 32a30 30 0 1 1 0 60 30 30 0 0 1 0-60z',
  hex: 'M40 31l27 15.5v31L40 93 13 77.5v-31z',
  gem: 'M22 42h36l12 16-30 38-30-38z',
}

/** Symbole, die als Linie (statt Fläche) geprägt werden */
const STROKE_ICONS = new Set<Medal['icon']>(['track'])

/** Große Medaille mit Band, Münzrand und geprägtem Symbol; Effekte steigen mit der Seltenheit. */
export function MedalArt({ tier, icon, size = 120, muted = false, label }: { tier: Tier; icon: Medal['icon']; size?: number; muted?: boolean; label?: string }) {
  const t = TIERS[tier]
  const id = useId()
  const shape = SHAPES[t.shape]
  const d = PATHS[icon]
  const stroke = STROKE_ICONS.has(icon)
  const fx = !muted
  return (
    <svg
      width={size}
      height={size * 1.25}
      viewBox="0 0 80 100"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{ overflow: 'visible', flexShrink: 0, filter: muted ? 'grayscale(.8) brightness(.7)' : 'drop-shadow(0 6px 6px rgba(0,0,0,.55)) drop-shadow(0 18px 24px rgba(0,0,0,.5))' }}
    >
      <defs>
        <linearGradient id={`${id}r`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={t.c1} />
          <stop offset="0.45" stopColor={t.c2} />
          <stop offset="1" stopColor={t.c3} />
        </linearGradient>
        <linearGradient id={`${id}f`} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={t.c1} />
          <stop offset="0.55" stopColor={t.c2} />
          <stop offset="1" stopColor={t.c3} />
        </linearGradient>
        <radialGradient id={`${id}g`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={t.glow} stopOpacity="0.55" />
          <stop offset="1" stopColor={t.glow} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}h`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FF7AD9" />
          <stop offset="0.25" stopColor="#7AE1FF" />
          <stop offset="0.5" stopColor="#B6FF7A" />
          <stop offset="0.75" stopColor="#FFE37A" />
          <stop offset="1" stopColor="#C69CFF" />
        </linearGradient>
        <clipPath id={`${id}c`}>
          <path d={shape} />
        </clipPath>
      </defs>
      {fx && t.aura && <circle className="glow" cx="40" cy="62" r="46" fill={`url(#${id}g)`} />}
      {fx && t.rays && (
        <g className="rays" opacity="0.5">
          <path d="M40 62L36 8h8zM40 62l4 54h-8zM40 62L-14 58v8zM40 62l54 4v-8zM40 62L2 24l5.6-5.6zM40 62l38 38-5.6 5.6zM40 62L2 100l-5.6-5.6zM40 62L78 24l5.6 5.6z" fill="#BDE6FF" opacity="0.35" />
        </g>
      )}
      <path d="M22 0h15l9 34H31z" fill={t.ribA} />
      <path d="M27 0h4l8.6 32h-4z" fill={t.stripe} opacity="0.9" />
      <path d="M58 0H43l-9 34h15z" fill={t.ribB} />
      <path d="M53 0h-4l-8.6 32h4z" fill={t.stripe} opacity="0.9" />
      <path d={shape} fill={`url(#${id}r)`} />
      <path d={shape} fill="none" stroke={t.edge} strokeWidth="1.2" opacity="0.7" />
      {t.shape === 'coin' && (
        <>
          <circle cx="40" cy="62" r="27.5" fill="none" stroke={t.dark} strokeWidth="2.2" strokeDasharray="1.2 2.1" opacity="0.55" />
          <circle cx="40" cy="62" r="24" fill={`url(#${id}f)`} />
          <circle cx="40" cy="62" r="24" fill="none" stroke={t.light} strokeWidth="1" opacity="0.7" />
        </>
      )}
      {t.shape === 'hex' && (
        <>
          <path d="M40 39l20 11.5v23L40 85 20 73.5v-23z" fill={`url(#${id}f)`} />
          <path d="M40 39l20 11.5v23L40 85 20 73.5v-23z" fill="none" stroke={t.light} strokeWidth="1" opacity="0.8" />
          {fx && (
            <g className="holo" clipPath={`url(#${id}c)`} opacity="0.38" style={{ mixBlendMode: 'soft-light' }}>
              <rect x="0" y="28" width="80" height="68" fill={`url(#${id}h)`} />
            </g>
          )}
        </>
      )}
      {t.shape === 'gem' && (
        <>
          <path d="M24 44h32l10 14-26 35-26-35z" fill="#DDF4FF" opacity="0.12" />
          <path d="M24 44l6 14h20l6-14M14 58h52M30 58l10 35 10-35M40 44l-10 14M40 44l10 14" fill="none" stroke="#FFFFFF" strokeWidth="1" opacity="0.75" strokeLinejoin="round" />
          <path d="M30 58h20l-10 35z" fill="#FFFFFF" opacity="0.18" />
          <path d="M24 44l6 14H14z" fill="#FF9BE6" opacity="0.28" />
          <path d="M56 44l-6 14h16z" fill="#8BE6FF" opacity="0.32" />
        </>
      )}
      <g transform="translate(28 50)">
        {stroke ? (
          <>
            <path d={d} fill="none" stroke={t.light} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" transform="translate(-0.6 -0.6)" />
            <path d={d} fill="none" stroke={t.ink} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </>
        ) : (
          <>
            <path d={d} fill={t.light} opacity="0.55" transform="translate(-0.6 -0.6)" fillRule="evenodd" />
            <path d={d} fill={t.ink} fillRule="evenodd" />
          </>
        )}
      </g>
      {fx && (
        <g clipPath={`url(#${id}c)`}>
          <rect className="sweep-big" x="12" y="20" width="10" height="90" fill="#FFFFFF" opacity="0.55" />
        </g>
      )}
      {fx && t.sparkle && (
        <>
          <path className="tw" d="M64 38l1.4 3.6 3.6 1.4-3.6 1.4L64 48l-1.4-3.6-3.6-1.4 3.6-1.4z" fill="#FFFFFF" />
          <path className="tw2" d="M17 76l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1z" fill="#FFFFFF" />
          <path className="tw3" d="M58 84l.9 2.2 2.2.9-2.2.9-.9 2.2-.9-2.2-2.2-.9 2.2-.9z" fill="#FFFFFF" />
        </>
      )}
    </svg>
  )
}

/** Runde Plakette für Listen und das Profil */
export function MedalBadge({ medal, size = 42 }: { medal: Medal; size?: number }) {
  const t = TIERS[medal.tier]
  const former = !!medal.former
  const d = PATHS[medal.icon]
  const stroke = STROKE_ICONS.has(medal.icon)
  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: former ? 'transparent' : `radial-gradient(circle at 35% 30%, ${t.c1} 0%, ${t.c2} 55%, ${t.c3} 100%)`,
        border: former ? '2px dashed #8C99A6' : undefined,
        boxShadow: former ? undefined : `inset 0 0 0 3px ${t.c3}, 0 0 14px ${t.glow}55`,
        opacity: former ? 0.6 : 1,
      }}
    >
      <svg width={size * 0.52} height={size * 0.52} viewBox="0 0 24 24">
        {stroke ? (
          <path d={d} fill="none" stroke={former ? '#B8C4CF' : t.ink} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d={d} fill={former ? '#B8C4CF' : t.ink} fillRule="evenodd" />
        )}
      </svg>
    </div>
  )
}
