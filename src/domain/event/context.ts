import type { Session } from '../../types'
import { isGuest } from '../drivers'
import { carValue, RATING, type RatingResult } from '../rating'
import type { EventContext } from './engine'
import type { EventDef } from './types'

/**
 * Bestzeit-Bonus nur gegen frühere Zeiten im selben Maßstab (1:24 ist deutlich schneller als 1:32) –
 * für Wettkämpfe ab diesem Tag.
 */
export const BEST_BY_SCALE_FROM = RATING.v2From

/**
 * Stärken für einen Wettkampf: Elo der Fahrer zu Beginn (vor dem Starttag), Autowertung auf der
 * Strecke und persönliche Bestzeiten vor dem Wettkampf. `scaleOf` liefert den Maßstab eines Autos
 * (24 oder 32).
 *
 * Wettkämpfe ab RATING.v2From: Autowertung, wie sie vor dem jeweiligen Lauf feststand; Fahrer, die zu
 * Beginn noch in der Einstufung sind, zählen mit ihrer Elo vor dem jeweiligen Lauf – so zählen ihre
 * tatsächlichen Ergebnisse statt des Startwerts. Ältere Wettkämpfe behalten die Autowertung nach der
 * alten Rechnung (Stand vor RATING.v2From) und die Elo zu Beginn.
 */
export function eventContext(def: EventDef, rating: RatingResult, allSessions: Session[], eventSessions: Session[], track: string | null, scaleOf: (car: string) => number = () => 32): EventContext {
  const newRules = def.start >= RATING.v2From
  const elo = new Map<string, number>()
  const runsBefore = new Map<string, number>()
  for (const [name, list] of rating.history) {
    const before = list.filter((e) => e.date < def.start)
    elo.set(name, before.length ? before[before.length - 1].after : RATING.start)
    runsBefore.set(name, before.length)
  }
  const placing = (n: string) => (runsBefore.get(n) ?? 0) < rating.placementRuns(n)
  const timeOf = new Map(allSessions.map((s) => [s.fileId, s.createdTime]))
  /** Elo vor einem Lauf: eigener Eintrag, sonst der letzte frühere Lauf, sonst der Stand zu Beginn */
  const eloAt = (n: string, at: Session) => {
    const h = rating.history.get(n) ?? []
    const own = h.find((e) => e.fileId === at.fileId)
    if (own) return own.before
    const earlier = h.filter((e) => e.date < at.date || (e.date === at.date && (timeOf.get(e.fileId) ?? '') < at.createdTime))
    return earlier.length ? earlier[earlier.length - 1].after : (elo.get(n) ?? RATING.start)
  }
  const byScale = def.start >= BEST_BY_SCALE_FROM
  const bestKey = (driver: string, car: string) => (byScale ? `${driver}\u0000${scaleOf(car)}` : driver)
  const best = new Map<string, number>()
  for (const s of allSessions) {
    if (s.date >= def.start || (track && s.track !== track)) continue
    for (const r of s.results) {
      if (isGuest(r.driver) || r.validBestLapMs == null) continue
      const key = bestKey(r.driver, r.car)
      if (r.validBestLapMs < (best.get(key) ?? Infinity)) best.set(key, r.validBestLapMs)
    }
  }
  // Typische saubere Runde je Auto bis zum Ende des Wettkampfs (spätere Läufe ändern nichts mehr)
  const lastDay = def.end ?? def.start
  const carLaps = new Map<string, number[]>()
  for (const s of allSessions) {
    if (s.date > lastDay || (track && s.track !== track)) continue
    for (const r of s.results) for (const l of r.lapTimes) if (l.status === 'normal') (carLaps.get(r.car) ?? carLaps.set(r.car, []).get(r.car)!).push(l.ms)
  }
  const carLapMs = (c: string) => {
    const xs = [...(carLaps.get(c) ?? [])].sort((a, b) => a - b)
    return xs.length >= 20 ? xs[Math.floor(xs.length / 2)] : null
  }
  return {
    sessions: eventSessions,
    elo: (n, at) => (newRules && at && placing(n) ? eloAt(n, at) : (elo.get(n) ?? RATING.start)),
    car: (c, at) => {
      if (!track) return 0
      if (!newRules) return carValue(rating.legacyCars, track, c)
      // Gefahrene Läufe: Stand vor dem Lauf (festgeschrieben), sonst der aktuelle Stand
      return carValue(at ? rating.carsBefore(at) : rating.cars, track, c)
    },
    carLapMs,
    previousBest: (n, car) => best.get(bestKey(n, car)) ?? null,
  }
}

/** Alle Autos, die der Wettkampf vorgibt (Listen und feste Zuteilung); leer = freie Wahl */
export function eventCars(def: EventDef): string[] {
  const rules = [def.cars, ...def.sections.map((s) => s.cars).filter((r) => r != null)]
  return [...new Set(rules.flatMap((r) => (r.mode === 'free' ? [] : [...r.pool, ...Object.values(r.fixed)])))]
}

/**
 * Typische Rundenzeit auf der Strecke (Median sauberer Runden), für die Zeitschätzung – mit den Autos
 * des Wettkampfs, wenn es von ihnen genug Runden gibt (1:24 ist deutlich schneller als 1:32)
 */
export function typicalLapMs(sessions: Session[], track: string | null, cars: string[] = []): number {
  const pick = (car: (c: string) => boolean) => {
    const laps: number[] = []
    for (const s of sessions) {
      if (track && s.track !== track) continue
      for (const r of s.results) if (car(r.car)) for (const l of r.lapTimes) if (l.status === 'normal') laps.push(l.ms)
    }
    return laps.sort((a, b) => a - b)
  }
  const own = cars.length ? pick((c) => cars.includes(c)) : []
  const laps = own.length >= 50 ? own : pick(() => true)
  return laps.length ? laps[Math.floor(laps.length / 2)] : 12000
}
