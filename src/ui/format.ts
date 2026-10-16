import type { Gap, Session } from '../types'
import { formatTime } from '../data/time'

export { formatTime }

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

/** „02/2026“ */
export function formatMonth(iso: string): string {
  const [y, m] = iso.split('-')
  return `${m}/${y}`
}

export function formatTrack(track: string, lengthCm: number | null): string {
  if (lengthCm == null) return track
  const meters = (lengthCm / 100).toLocaleString('de-DE', { maximumFractionDigits: 2 })
  return `${track} · ${meters} m`
}

export function formatGap(gap: Gap, position = 0): string {
  switch (gap.kind) {
    case 'leader':
      return 'Sieger'
    case 'time':
      return `+${formatTime(gap.ms)}`
    case 'laps':
      return `+${gap.laps} ${gap.laps === 1 ? 'Runde' : 'Runden'}`
    case 'none':
      return position === 1 ? 'Sieger' : '–'
  }
}

export function sessionTitle(s: Session, sameTypeCount: number): string {
  return sameTypeCount > 1 ? `${s.type} ${s.heat}` : s.type
}

const nf = (digits = 0) => new Intl.NumberFormat('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits })

export const fmtInt = (v: number | null | undefined) => (v == null ? '–' : nf(0).format(Math.round(v)))
export const fmtNum = (v: number | null | undefined, digits = 1) => (v == null ? '–' : nf(digits).format(v))
export const fmtPct = (share: number | null | undefined, digits = 0) => (share == null ? '–' : `${nf(digits).format(share * 100)} %`)
export const fmtElo = (v: number | null | undefined) => fmtInt(v)
export const fmtDelta = (v: number) => {
  const r = Math.round(v)
  return r > 0 ? `+${r}` : r < 0 ? `−${Math.abs(r)}` : '±0'
}
/** Abstand zur typischen Bestzeit: „+0,62 s“ */
export const fmtGapSec = (ms: number | null | undefined) => (ms == null ? '–' : `${ms < 0 ? '−' : '+'}${nf(2).format(Math.abs(ms) / 1000)} s`)
export const fmtSeconds = (ms: number, digits = 1) => `${nf(digits).format(ms / 1000)} s`

/** Initialen für Avatare: „Anton Berger“ → AB, „Mika“ → MI, „K. Lindner“ → KL */
export function initials(name: string): string {
  const clean = name.replace(/\(.*?\)/g, '').trim()
  const parts = clean.split(/[\s.]+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return clean.slice(0, 2).toUpperCase()
}

/** Kurzname für enge Diagramme: „Anton Berger“ → „Anton“, „K. Lindner“ → „Lindner“ */
export function shortName(name: string): string {
  const parts = name.split(' ').filter(Boolean)
  if (parts.length < 2) return name
  return /\.$/.test(parts[0]) ? parts.slice(1).join(' ') : parts[0]
}

export const plural = (n: number, one: string, many: string) => `${fmtInt(n)} ${n === 1 ? one : many}`
