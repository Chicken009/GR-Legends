import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { CHALLENGE_XP, type Challenge } from '../domain/challenges'
import { Avatar, driverPath } from './components'
import { CurrencyIcon, XP_COLOR } from './currency'
import { NAV_ICONS, StrokeIcon } from './icons'
import { rarity } from './challengeUtils'


/** Symbol je Challenge (24er-Raster, Linien) */
const ICONS: Record<string, string> = {
  tage: 'M5 6h14v14H5zM5 10h14M9 4v4M15 4v4',
  sieg: NAV_ICONS.season,
  sauber: 'M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6zM9 12l2 2 4-4',
  gegner: 'M12 3v4M12 17v4M3 12h4M17 12h4M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z',
  bestzeit: 'M12 9v4l3 2M9 2.5h6M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16z',
  bonus: 'M13 2L4 14h7l-1 8 9-12h-7z',
  autos: NAV_ICONS.cars,
  podest: NAV_ICONS.events,
  serie: 'M5 7l5 5-5 5M12 7l5 5-5 5',
  rennen10: 'M12 21c-4 0-6.5-2.6-6.5-6 0-3.5 3-5.5 4-9 2.5 1.5 3.5 4 3.5 6 1-1 1.5-2 1.5-3 2 1.5 4 4 4 6 0 3.4-2.5 6-6.5 6z',
  qualis: NAV_ICONS.races,
  aussenseiter: 'M3 20l6-10 4 6 3-4 5 8z',
  comeback: 'M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4v4h4',
  grossesfeld: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c0-3.3 2.7-5 6-5s6 1.7 6 5M16.5 11a2.5 2.5 0 1 0 0-5M21 19.5c0-2.4-1.6-3.8-4-4.3',
  km: 'M8 21l2.5-18M16 21l-2.5-18M12 6v2M12 11v2M12 16v2',
  runden: 'M17 2l3 3-3 3M20 5H9a5 5 0 0 0 0 10M7 22l-3-3 3-3M4 19h11a5 5 0 0 0 0-10',
  neuesauto: 'M15 3.5a5 5 0 1 1-4.6 6.9L4 16.8V20h3.2v-2h2v-2h2l1.1-1.1A5 5 0 0 1 15 3.5zM16 7.5h.01',
  konstant: 'M3 12h3l2-5 4 10 2-5h7',
  tagessieger: 'M3 19h18M4 8l4 4 4-7 4 7 4-4-2 11H6z',
  pbautos: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-2.4z',
}


/** Rundes Abzeichen: Symbol in einem Fortschrittsring, geschafft = gefüllt */
export function ChallengeBadge({ c, accent, size = 52, fresh }: { c: Challenge; accent: string; size?: number; fresh?: boolean }) {
  const stroke = Math.max(3, size / 14)
  const r = (size - stroke) / 2
  const len = 2 * Math.PI * r
  const share = Math.min(1, c.value / c.target)
  return (
    <span className={fresh ? 'pop' : undefined} style={{ position: 'relative', width: size, height: size, flexShrink: 0, display: 'inline-flex' }} aria-hidden="true">
      <svg width={size} height={size} style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill={c.done ? accent : '#1F242B'} stroke={c.done ? accent : '#2E343D'} strokeWidth={stroke} />
        {!c.done && share > 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={accent} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${len * share} ${len}`} />}
      </svg>
      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <StrokeIcon d={ICONS[c.id] ?? NAV_ICONS.season} size={Math.round(size * 0.46)} color={c.done ? '#0E1013' : share > 0 ? '#C5CCD3' : '#6B7480'} width={2} />
      </span>
    </span>
  )
}

/** „+20 XP“ in Gold: gefüllt = erhalten, gestrichelt = noch offen */
export function XpChip({ done }: { done: boolean }) {
  return (
    <span
      title={done ? `${CHALLENGE_XP} XP erhalten` : `bringt ${CHALLENGE_XP} XP`}
      aria-label={done ? `${CHALLENGE_XP} XP erhalten` : `bringt ${CHALLENGE_XP} XP`}
      className="num"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 3, padding: '3px 8px', borderRadius: 999, fontSize: 11, fontWeight: 800, flexShrink: 0,
        border: done ? `1.5px solid ${XP_COLOR}` : '1.5px dashed #5A5040',
        background: done ? XP_COLOR : 'transparent',
        color: done ? '#1A1205' : '#B9A67E',
      }}
    >
      <CurrencyIcon kind="xp" size={11} color={done ? '#1A1205' : '#B9A67E'} />+{CHALLENGE_XP} XP
    </span>
  )
}

/** Kleine Avatar-Reihe der Fahrer, die es geschafft haben */
export function AvatarStack({ names, me, max = 6 }: { names: string[]; me?: string | null; max?: number }) {
  const location = useLocation()
  if (!names.length) return null
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center' }} aria-label={`Geschafft: ${names.join(', ')}`} title={names.join(', ')}>
      {names.slice(0, max).map((n, i) => (
        <Link key={n} to={driverPath(n)} state={{ bg: location }} style={{ marginLeft: i ? -7 : 0, borderRadius: '50%', boxShadow: '0 0 0 2px var(--inner)' }}>
          <Avatar name={n} size={22} ring={n === me ? 'var(--me)' : undefined} />
        </Link>
      ))}
      {names.length > max && <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 4 }}>+{names.length - max}</span>}
    </span>
  )
}

/** Seltenheit als kleines Etikett plus Avatar-Reihe */
export function RarityLine({ doneBy, total, me }: { doneBy: string[]; total: number; me?: string | null }) {
  const r = rarity(doneBy.length, total)
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: r.color, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <span style={{ width: 6, height: 6, borderRadius: 3, background: r.color }} />
        {r.label}
        {doneBy.length > 0 && <span style={{ color: 'var(--faint)', fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>· {doneBy.length} von {total}</span>}
      </span>
      <AvatarStack names={doneBy} me={me} />
    </span>
  )
}

/** Eine Saison-Challenge als Zeile: Abzeichen mit Ring, Text, Fortschritt, XP */
export function ChallengeItem({ c, accent, showProgress = true, footer, fresh }: { c: Challenge; accent: string; showProgress?: boolean; footer?: ReactNode; fresh?: boolean }) {
  return (
    <div className="inner" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: '12px 14px' }}>
      <ChallengeBadge c={showProgress ? c : { ...c, value: 0, done: false }} accent={accent} fresh={fresh} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {c.label}
            {fresh && <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.6, padding: '2px 6px', borderRadius: 999, background: accent, color: '#0E1013' }}>NEU</span>}
          </span>
          <XpChip done={showProgress && c.done} />
        </div>
        <span style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.4 }}>
          {c.detail}
          {showProgress && !c.done && (
            <b className="num" style={{ color: 'var(--text-2)', marginLeft: 6 }}>
              {c.value} / {c.target}
            </b>
          )}
        </span>
        {footer}
      </div>
    </div>
  )
}
