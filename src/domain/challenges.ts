import type { Session } from '../types'
import { isGuest } from './drivers'

/** Saison-Challenges: kleine Aufgaben pro Jahr, jede geschaffte bringt Karriere-XP. */
export interface Challenge {
  id: string
  label: string
  detail: string
  value: number
  target: number
  done: boolean
}

export const CHALLENGE_XP = 20

const isQualiSession = (s: Session) => /quali/i.test(s.type)

/**
 * Challenges eines Fahrers in den Läufen eines Jahres (chronologisch sortiert).
 * `personalBests` = Anzahl verbesserter persönlicher Bestzeiten im Jahr.
 * `dayBonus` = Pole oder schnellste Runde eines Renntags im Jahr (aus der Saisonwertung).
 */
export function seasonChallenges(sessions: Session[], driver: string, personalBests: number, dayBonus: number): Challenge[] {
  const mine = sessions.filter((s) => s.results.some((r) => r.driver === driver))
  const races = mine.filter((s) => !isQualiSession(s))
  const days = new Set(mine.map((s) => s.date)).size
  const results = races.map((s) => ({ s, r: s.results.find((r) => r.driver === driver)! }))
  const wins = results.filter(({ s, r }) => r.position === 1 && s.results.length > 1)
  const winCars = new Set(wins.map(({ r }) => r.car)).size
  const beaten = new Set<string>()
  for (const { s, r } of results) for (const o of s.results) if (o.position > r.position && !isGuest(o.driver)) beaten.add(o.driver)
  // längste Serie von Rennen ohne Abflug (nur Rennen ohne Tankfunktion)
  let clean = 0
  let bestClean = 0
  for (const { s, r } of results) {
    if (s.tank) continue
    if (r.lapTimes.some((l) => l.status === 'crash')) clean = 0
    else bestClean = Math.max(bestClean, ++clean)
  }
  const make = (id: string, label: string, detail: string, value: number, target: number): Challenge => ({ id, label, detail, value: Math.min(value, target), target, done: value >= target })
  return [
    make('tage', 'Stammgast', 'An 3 Renntagen dabei sein', days, 3),
    make('sieg', 'Siegertyp', 'Ein Rennen gewinnen', wins.length, 1),
    make('sauber', 'Saubere Serie', '3 Rennen am Stück ohne Abflug (ohne Tankfunktion)', bestClean, 3),
    make('gegner', 'Gegnerjäger', '5 verschiedene Gegner schlagen', beaten.size, 5),
    make('bestzeit', 'Schneller als je zuvor', 'Die persönliche Bestzeit verbessern', personalBests, 1),
    make('bonus', 'Bonusjäger', 'Pole oder schnellste Runde eines Renntags holen', dayBonus, 1),
    make('autos', 'Allrounder', 'Mit 3 verschiedenen Autos gewinnen', winCars, 3),
  ]
}
