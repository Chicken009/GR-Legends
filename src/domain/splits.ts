import type { Session } from '../types'
import { isGuest } from './drivers'
import { SPLIT_LAPS, splitTime } from './laps'
import { isQuali } from './rating'

/**
 * Gesamtzeiten über die ersten 10 bzw. 20 Runden eines Rennens: Bestmarken, Rekorde und
 * Zeitmarken (runde Grenzen wie „10 Runden unter 2:00“). Gezählt wird nur je Strecke und ohne
 * Tankfunktion – Boxenzeiten und nicht gezählte Runden würden die Summe verzerren.
 */
export interface SplitEntry {
  driver: string
  track: string
  n: number
  ms: number
  date: string
  fileId: string
  car: string
  /** Bisherige Bestmarke des Fahrers (Strecke, n) vor diesem Rennen */
  prevBest: number | null
}

export interface SplitRecord {
  ms: number
  driver: string
  date: string
  car: string
  prev: { ms: number; driver: string } | null
}

/**
 * Neue Belohnungen gelten erst ab dem nächsten Zeitraum, damit sich bestehende Ergebnisse
 * (Medaillen, Challenges, XP) nicht nachträglich ändern. Anzeigen, Ziele und Tipps gibt es sofort.
 */
export const SPLIT_REWARDS_FROM = 2027

export const splitKey = (track: string, n: number) => `${track}\u0000${n}`

/** „runde“ Schrittweite der Zeitmarken: etwa 3,5 % der typischen Zeit (10 Runden à 13 s → 5 s, 20 Runden → 10 s) */
const NICE_STEPS = [1, 2, 5, 10, 15, 20, 30, 60]
export function markStep(typicalMs: number): number {
  const raw = (typicalMs / 1000) * 0.035
  return (NICE_STEPS.find((s) => s >= raw) ?? 60) * 1000
}

/** Schnellste Zeitmarke, die mit `ms` unterboten ist (Vielfaches der Schrittweite) */
export const markReached = (ms: number, step: number) => (Math.floor(ms / step) + 1) * step
/** Nächste noch nicht erreichte Marke */
export const markNext = (ms: number, step: number) => markReached(ms, step) - step

/** „2:00“, „1:55“, „4:10“ – Marken sind ganze Sekunden */
export function fmtMark(ms: number): string {
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export interface Splits {
  /** chronologisch */
  entries: SplitEntry[]
  /** Schrittweite der Zeitmarken je Strecke + n */
  step: Map<string, number>
  /** aktueller Rekord je Strecke + n (ohne Gäste) */
  records: Map<string, SplitRecord>
  /** Rekordwechsel in zeitlicher Folge */
  recordTimeline: (SplitRecord & { track: string; n: number })[]
  /** Bestmarke eines Fahrers, optional nur Rennen vor `before` */
  best: (driver: string, track: string, n: number, before?: string) => number | null
}

export function buildSplits(sessions: Session[]): Splits {
  const entries: SplitEntry[] = []
  const pbs = new Map<string, number>()
  const records = new Map<string, SplitRecord>()
  const recordTimeline: Splits['recordTimeline'] = []
  const all = new Map<string, number[]>()
  for (const s of sessions) {
    if (isQuali(s) || s.tank) continue
    for (const r of s.results) {
      if (isGuest(r.driver)) continue
      for (const n of SPLIT_LAPS) {
        const ms = splitTime(r, n)
        if (ms == null) continue
        const key = splitKey(s.track, n)
        const pk = `${r.driver}\u0000${key}`
        const prevBest = pbs.get(pk) ?? null
        entries.push({ driver: r.driver, track: s.track, n, ms, date: s.date, fileId: s.fileId, car: r.car, prevBest })
        if (prevBest == null || ms < prevBest) pbs.set(pk, ms)
        all.set(key, [...(all.get(key) ?? []), ms])
        const rec = records.get(key)
        if (!rec || ms < rec.ms) {
          const next = { ms, driver: r.driver, date: s.date, car: r.car, prev: rec ? { ms: rec.ms, driver: rec.driver } : null }
          records.set(key, next)
          recordTimeline.push({ ...next, track: s.track, n })
        }
      }
    }
  }
  const step = new Map<string, number>()
  for (const [key, xs] of all) {
    const sorted = [...xs].sort((a, b) => a - b)
    step.set(key, markStep(sorted[Math.floor(sorted.length / 2)]))
  }
  const best = (driver: string, track: string, n: number, before?: string) => {
    let out: number | null = null
    for (const e of entries) {
      if (e.driver !== driver || e.track !== track || e.n !== n || (before && e.date >= before)) continue
      if (out == null || e.ms < out) out = e.ms
    }
    return out
  }
  return { entries, step, records, recordTimeline, best }
}
