import type { Session } from '../../types'
import { isGuest } from '../drivers'
import { carKey, RATING, type RatingResult } from '../rating'
import type { EventContext } from './engine'
import type { EventDef } from './types'

/**
 * Stärken für einen Wettkampf: Elo der Fahrer zu Beginn (vor dem Starttag), Autowertung auf der
 * Strecke und persönliche Bestzeiten vor dem Wettkampf.
 */
export function eventContext(def: EventDef, rating: RatingResult, allSessions: Session[], eventSessions: Session[], track: string | null): EventContext {
  const elo = new Map<string, number>()
  for (const [name, list] of rating.history) {
    const before = list.filter((e) => e.date < def.start)
    elo.set(name, before.length ? before[before.length - 1].after : RATING.start)
  }
  const best = new Map<string, number>()
  for (const s of allSessions) {
    if (s.date >= def.start || (track && s.track !== track)) continue
    for (const r of s.results) {
      if (isGuest(r.driver) || r.validBestLapMs == null) continue
      if (r.validBestLapMs < (best.get(r.driver) ?? Infinity)) best.set(r.driver, r.validBestLapMs)
    }
  }
  return {
    sessions: eventSessions,
    elo: (n) => elo.get(n) ?? RATING.start,
    car: (c) => (track ? (rating.cars.get(carKey(track, c)) ?? 0) : 0),
    previousBest: (n) => best.get(n) ?? null,
  }
}

/** Typische Rundenzeit auf der Strecke (Median gültiger Runden), für die Zeitschätzung */
export function typicalLapMs(sessions: Session[], track: string | null): number {
  const laps: number[] = []
  for (const s of sessions) {
    if (track && s.track !== track) continue
    for (const r of s.results) for (const l of r.lapTimes) if (l.status === 'normal') laps.push(l.ms)
  }
  if (!laps.length) return 12000
  laps.sort((a, b) => a - b)
  return laps[Math.floor(laps.length / 2)]
}
