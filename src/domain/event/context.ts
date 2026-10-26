import type { Session } from '../../types'
import { isGuest } from '../drivers'
import { carKey, RATING, type RatingResult } from '../rating'
import type { EventContext } from './engine'
import type { EventDef } from './types'

/**
 * Bestzeit-Bonus nur gegen frühere Zeiten im selben Maßstab (1:24 ist deutlich schneller als 1:32) –
 * für Wettkämpfe ab diesem Tag.
 */
export const BEST_BY_SCALE_FROM = '2026-10-26'

/**
 * Stärken für einen Wettkampf: Elo der Fahrer zu Beginn (vor dem Starttag), Autowertung auf der
 * Strecke und persönliche Bestzeiten vor dem Wettkampf. `scaleOf` liefert den Maßstab eines Autos
 * (24 oder 32).
 */
export function eventContext(def: EventDef, rating: RatingResult, allSessions: Session[], eventSessions: Session[], track: string | null, scaleOf: (car: string) => number = () => 32): EventContext {
  const elo = new Map<string, number>()
  for (const [name, list] of rating.history) {
    const before = list.filter((e) => e.date < def.start)
    elo.set(name, before.length ? before[before.length - 1].after : RATING.start)
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
  return {
    sessions: eventSessions,
    elo: (n) => elo.get(n) ?? RATING.start,
    car: (c) => (track ? (rating.cars.get(carKey(track, c)) ?? 0) : 0),
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
