import type { Lap, Result, Session } from '../types'
import { canonicalDriver, isGuest, type DriverAliases } from './drivers'

export const LAP_THRESHOLDS = {
  /**
   * Runde < Faktor × Referenz → deutlich zu schnell. Ungültig nur, wenn das sowohl für die
   * Referenz des Autos als auch für die des Fahrers gilt (z. B. Auto per Hand eingesetzt,
   * von der Smartrace-Mindestrundenzeit nicht erfasst).
   */
  invalidFactor: 0.8,
  /** Referenz = dieses Perzentil aller Runden (robuste „typische Bestzeit“) */
  referenceQuantile: 0.1,
  /** Mindestanzahl Runden, damit eine Referenz zählt */
  minLaps: 5,
  /** Runde > Faktor × saubere Referenzrunde des Fahrers im Lauf → Boxenstopp oder Abflug */
  incidentFactor: 1.3,
  /** Erste Runde (mit stehendem Start): erst ab diesem Faktor ein Zwischenfall */
  firstLapFactor: 1.6,
  /**
   * Typischer Zeitverlust einer Boxenrunde (Tanken) in ms. Abgeglichen mit den Boxenstopps aus
   * einem Smartrace-Backup: Stopps kosten meist deutlich mehr als die reine Standzeit.
   */
  pitLossMs: 12000,
}

export type LapThresholds = typeof LAP_THRESHOLDS

export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

/** Saubere Referenzrunde: Median der schnelleren Hälfte der (gültigen) Runden. */
export function cleanReference(laps: number[]): number | null {
  if (laps.length === 0) return null
  const sorted = [...laps].sort((a, b) => a - b)
  return quantile(sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 2))), 0.5)
}

const carKey = (track: string, car: string) => `${track}\u0000car\u0000${car}`
const driverKey = (track: string, driver: string) => `${track}\u0000driver\u0000${driver}`

/** Referenzzeiten pro Strecke + Auto und Strecke + Fahrer über alle Läufe. */
function buildReferences(sessions: Session[], aliases: DriverAliases, t: LapThresholds) {
  const pools = new Map<string, number[]>()
  const add = (key: string, laps: number[]) => {
    const pool = pools.get(key)
    if (pool) pool.push(...laps)
    else pools.set(key, [...laps])
  }
  for (const s of sessions) {
    for (const r of s.results) {
      const laps = r.lapTimes.map((l) => l.ms)
      add(carKey(s.track, r.car), laps)
      if (!isGuest(r.driver)) add(driverKey(s.track, canonicalDriver(r.driver, aliases)), laps)
    }
  }
  const refs = new Map<string, number>()
  for (const [key, laps] of pools) {
    if (laps.length >= t.minLaps) {
      refs.set(key, quantile(laps.sort((a, b) => a - b), t.referenceQuantile))
    }
  }
  return refs
}

/**
 * Die Tankfunktion gilt für alle und das ganze Rennen. Mit Tank muss (fast) jeder an die Box;
 * ohne Tank ist ein einzelner gezählter Stopp kein echter Boxenstopp. Deshalb zählt
 * ein Lauf als Tankrennen, wenn mehr als die Hälfte der Fahrer Boxenstopps hat.
 */
export function hasTankFunction(s: Session): boolean {
  const withStops = s.results.filter((r) => r.pitStops > 0).length
  return withStops > 0 && withStops > s.results.length / 2
}

/**
 * Teilt die Ausreißer-Runden eines Fahrers in Boxenstopps und Abflüge auf.
 *
 * - Ohne Tankfunktion ist es kein Rennen mit Boxenstopps: Von Smartrace gezählte Stopps werden
 *   ignoriert, alle Ausreißer sind Abflüge.
 * - Mit Tankfunktion: Ein Boxenstopp kostet etwa `pitLossMs`; bei leerem Tank wird zusätzlich
 *   mindestens eine Runde nicht gezählt (Verlust ≈ k × Referenz + Boxenzeit). Die Boxenstopps
 *   bekommen die Ausreißer, die am besten zu diesem Muster passen, der Rest sind Abflüge.
 */
export function classifyIncidents(
  laps: Lap[],
  pitStops: number,
  tank: boolean,
  t = LAP_THRESHOLDS,
  fallbackRef: number | null = null,
): Lap[] {
  const valid = laps.filter((l) => l.status !== 'invalid').map((l) => l.ms)
  // Bei sehr kurzen Läufen dient die typische Bestzeit von Fahrer bzw. Auto als Referenz
  const ref = valid.length >= 3 ? cleanReference(valid) : fallbackRef
  if (ref == null) return laps
  const outliers = laps
    .map((l, i) => ({ i, loss: l.ms - ref, lap: l }))
    .filter((o) => o.lap.status !== 'invalid' && o.lap.ms > ref * (o.lap.number === 1 ? t.firstLapFactor : t.incidentFactor))

  const fit = (loss: number) => {
    let best = Infinity
    for (let k = 0; k <= 3; k++) best = Math.min(best, Math.abs(loss - (k * ref + t.pitLossMs)))
    return best
  }
  const pitIdx = new Set(
    [...outliers]
      .sort((a, b) => fit(a.loss) - fit(b.loss))
      .slice(0, tank ? Math.max(0, pitStops) : 0)
      .map((o) => o.i),
  )
  const out: Lap[] = laps.map((l) => ({ ...l, status: l.status === 'invalid' ? 'invalid' : 'normal', lossMs: undefined }))
  for (const o of outliers) {
    out[o.i] = { ...out[o.i], status: pitIdx.has(o.i) ? 'pit' : 'crash', lossMs: Math.round(o.loss) }
  }
  return out
}

function classifyResult(r: Result, refs: number[], tank: boolean, t: LapThresholds): Result {
  const limits = refs.map((ref) => ref * t.invalidFactor)
  const marked = r.lapTimes.map((l) => ({
    ...l,
    status: limits.length > 0 && limits.every((limit) => l.ms < limit) ? ('invalid' as const) : ('normal' as const),
  }))
  const lapTimes = classifyIncidents(marked, r.pitStops, tank, t, refs.length ? Math.max(...refs) : null)
  const valid = lapTimes.filter((l) => l.status !== 'invalid').map((l) => l.ms)
  return { ...r, lapTimes, validBestLapMs: valid.length ? Math.min(...valid) : null }
}

/**
 * Klassifiziert alle Rundenzeiten aller Läufe: ungültige Runden (zu schnell), Boxenstopps
 * und Abflüge. Gäste haben keine Fahrer-Referenz, für sie zählt nur das Auto. Fehlen beide
 * Referenzen, wird mit allen Runden des Laufs verglichen.
 */
export function classifyAllLaps(
  sessions: Session[],
  aliases: DriverAliases = {},
  t: LapThresholds = LAP_THRESHOLDS,
): Session[] {
  const refs = buildReferences(sessions, aliases, t)

  return sessions.map((s) => {
    const all = s.results.flatMap((r) => r.lapTimes.map((l) => l.ms)).sort((a, b) => a - b)
    const sessionRef = all.length >= t.minLaps ? quantile(all, t.referenceQuantile) : null
    const tank = hasTankFunction(s)

    return {
      ...s,
      tank,
      results: s.results.map((r) => {
        const carRef = refs.get(carKey(s.track, r.car))
        const driverRef = isGuest(r.driver)
          ? undefined
          : refs.get(driverKey(s.track, canonicalDriver(r.driver, aliases)))
        let found = [carRef, driverRef].filter((ref): ref is number => ref != null)
        if (found.length === 0 && sessionRef != null) found = [sessionRef]
        return classifyResult(r, found, tank, t)
      }),
    }
  })
}

/** Gesamtzeiten über die ersten Runden eines Rennens (vergleichbar über verschiedene Renndauern) */
export const SPLIT_LAPS = [10, 20] as const

/**
 * Gesamtzeit der ersten `n` Runden. null, wenn der Fahrer weniger Runden gefahren ist oder eine
 * ungültige (zu kurze) Runde darin liegt – dann wäre die Zeit nicht vergleichbar.
 */
export function splitTime(r: Result, n: number): number | null {
  if (r.lapTimes.length < n) return null
  const first = r.lapTimes.slice(0, n)
  if (first.some((l) => l.status === 'invalid')) return null
  return first.reduce((sum, l) => sum + l.ms, 0)
}
