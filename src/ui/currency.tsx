import type { CSSProperties } from 'react'
import { AREA } from './colors'
import { NAV_ICONS, StrokeIcon } from './icons'
import { fmtPts } from './format'

/**
 * Drei Wertungen, die man nicht verwechseln soll – jede mit fester Farbe, Symbol und Einheit:
 * Elo (Stärke, grün, Tacho) · Saisonpunkte (blau, Pokal) · Erfahrungspunkte (gold, Stern).
 */
export type Currency = 'elo' | 'pts' | 'xp'

export const XP_COLOR = '#F4B43A'
export const XP_GRADIENT = 'linear-gradient(145deg, #FFDC85, #F4B43A 55%, #B57D0E)'

const GAUGE = 'M3.5 16.5a8.5 8.5 0 1 1 17 0M12 16.5l4.2-5.2M7 16.5h.01M17 16.5h.01'
const STAR = 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z'

export const CURRENCY: Record<Currency, { unit: string; name: string; color: string; icon: string }> = {
  elo: { unit: 'Elo', name: 'Elo', color: AREA.drivers, icon: GAUGE },
  pts: { unit: 'Pkt.', name: 'Saisonpunkte', color: AREA.season, icon: NAV_ICONS.season },
  xp: { unit: 'XP', name: 'Erfahrungspunkte', color: XP_COLOR, icon: STAR },
}

export function CurrencyIcon({ kind, size = 14, color }: { kind: Currency; size?: number; color?: string }) {
  return <StrokeIcon d={CURRENCY[kind].icon} size={size} color={color ?? CURRENCY[kind].color} width={2.2} />
}

const fmt = (v: number, kind: Currency) => (kind === 'pts' ? fmtPts(Math.round(v * 10) / 10) : Math.round(v).toLocaleString('de-DE'))

/**
 * Zahl mit Symbol und Einheit, z. B. „⏱ 609 Elo“, „🏆 41 Pkt.“, „★ +20 XP“.
 * `plain`: Zahl in Textfarbe, nur Symbol und Einheit farbig (für Listen mit vielen Werten).
 */
export function Amount({ kind, value, signed, size = 14, plain, unit = true, style }: { kind: Currency; value: number; signed?: boolean; size?: number; plain?: boolean; unit?: boolean; style?: CSSProperties }) {
  const c = CURRENCY[kind]
  const text = signed ? `${value > 0 ? '+' : value < 0 ? '−' : '±'}${fmt(Math.abs(value), kind)}` : fmt(value, kind)
  return (
    <span className="amount num" style={{ display: 'inline-flex', alignItems: 'center', gap: Math.max(3, size * 0.25), fontSize: size, fontWeight: 800, color: plain ? undefined : c.color, whiteSpace: 'nowrap', ...style }} aria-label={`${text} ${c.name}`}>
      <CurrencyIcon kind={kind} size={Math.round(size * 0.95)} />
      <span aria-hidden="true">{text}</span>
      {unit && (
        <span aria-hidden="true" style={{ fontSize: Math.max(10, size * 0.62), fontWeight: 700, color: c.color, opacity: plain ? 1 : 0.85 }}>
          {c.unit}
        </span>
      )}
    </span>
  )
}
