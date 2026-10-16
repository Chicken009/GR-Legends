import type { Session } from '../types'
import { isGuest } from './drivers'

/**
 * Saisonwertung mit Punkten – abgestimmt auf kleine Felder (meist 2–6 Fahrer) und Renntage mit
 * sehr unterschiedlich vielen Rennen (1–9):
 * - pro Rennen 1 Punkt je geschlagenem Gegner (auch Gäste), Sieg +1
 * - pro Renntag zählen die besten `racesPerDay` Rennen
 * - Bonus pro Renntag: schnellste Runde des Tages, Pole (Schnellster im Qualifying)
 * - der letzte Renntag eines Jahres zählt doppelt, wenn er im Dezember liegt (Saisonfinale)
 * - Streichresultate: Es zählen die besten `countedDays` Renntage
 */
export const SEASON_POINTS = {
  perBeaten: 1,
  win: 1,
  racesPerDay: 3,
  fastestLap: 2,
  pole: 1,
  finaleFactor: 2,
  countedDays: 5,
}

export interface SeasonDay {
  date: string
  /** Punkte des Tages inkl. Bonus und Finale-Faktor */
  points: number
  /** Punkte der gewerteten Rennen (ohne Bonus) */
  racePoints: number
  races: number
  fastestLap: boolean
  pole: boolean
  finale: boolean
  /** zählt zu den besten Renntagen (sonst Streichresultat) */
  counted: boolean
}

export interface SeasonStanding {
  name: string
  points: number
  /** Punkte ohne Streichresultate */
  gross: number
  days: SeasonDay[]
  races: number
  wins: number
  podiums: number
  poles: number
  fastestLaps: number
  /** Platz in der Saison (Gleichstand: gleicher Platz) */
  rank: number
  /** Punkte nach jedem Renntag der Saison (für den Verlauf), null = noch nicht dabei */
  progress: (number | null)[]
}

export interface ConstructorStanding {
  car: string
  points: number
  races: number
  wins: number
  drivers: number
}

const isQualiSession = (s: Session) => /quali/i.test(s.type)

/** Rennpunkte eines Ergebnisses: geschlagene Gegner + Siegbonus */
export function racePoints(s: Session, position: number, cfg = SEASON_POINTS): number {
  const beaten = s.results.filter((r) => r.position > position).length
  return beaten * cfg.perBeaten + (position === 1 && s.results.length > 1 ? cfg.win : 0)
}

/** Bester gültiger Rundenwert eines Fahrers in diesen Läufen */
function fastest(sessions: Session[]): string | null {
  let best: { name: string; ms: number } | null = null
  for (const s of sessions) {
    for (const r of s.results) {
      if (isGuest(r.driver) || r.validBestLapMs == null) continue
      if (!best || r.validBestLapMs < best.ms) best = { name: r.driver, ms: r.validBestLapMs }
    }
  }
  return best?.name ?? null
}

/** Saisonwertung für die Läufe eines Jahres (beliebige Reihenfolge). */
export function seasonStandings(sessions: Session[], cfg = SEASON_POINTS): SeasonStanding[] {
  const dates = [...new Set(sessions.map((s) => s.date))].sort()
  const last = dates[dates.length - 1]
  const finaleDate = last && last.slice(5, 7) === '12' ? last : null
  const byDriver = new Map<string, SeasonStanding>()
  const get = (name: string) =>
    byDriver.get(name) ??
    (byDriver.set(name, { name, points: 0, gross: 0, days: [], races: 0, wins: 0, podiums: 0, poles: 0, fastestLaps: 0, rank: 0, progress: [] }), byDriver.get(name)!)

  for (const date of dates) {
    const day = sessions.filter((s) => s.date === date)
    const races = day.filter((s) => !isQualiSession(s))
    const qualis = day.filter(isQualiSession)
    const pts = new Map<string, number[]>()
    for (const s of races) {
      for (const r of s.results) {
        if (isGuest(r.driver)) continue
        pts.set(r.driver, [...(pts.get(r.driver) ?? []), racePoints(s, r.position, cfg)])
        const st = get(r.driver)
        st.races++
        if (r.position === 1 && s.results.length > 1) st.wins++
        if (r.position <= 3 && s.results.length > 3) st.podiums++
      }
    }
    const fl = fastest(races)
    const pole = qualis.length ? fastest(qualis) : null
    const present = new Set([...pts.keys(), ...qualis.flatMap((s) => s.results.map((r) => r.driver)).filter((n) => !isGuest(n))])
    for (const name of present) {
      const list = (pts.get(name) ?? []).sort((a, b) => b - a)
      const racePts = list.slice(0, cfg.racesPerDay).reduce((a, b) => a + b, 0)
      const bonus = (name === fl ? cfg.fastestLap : 0) + (name === pole ? cfg.pole : 0)
      const finale = date === finaleDate
      const st = get(name)
      if (name === fl) st.fastestLaps++
      if (name === pole) st.poles++
      st.days.push({ date, points: (racePts + bonus) * (finale ? cfg.finaleFactor : 1), racePoints: racePts, races: list.length, fastestLap: name === fl, pole: name === pole, finale, counted: false })
    }
    // Zwischenstand nach diesem Renntag (mit Streichresultaten)
    for (const st of byDriver.values()) {
      const best = [...st.days].sort((a, b) => b.points - a.points).slice(0, cfg.countedDays)
      st.progress.push(st.days.length ? best.reduce((a, d) => a + d.points, 0) : null)
    }
  }

  const out = [...byDriver.values()]
  for (const st of out) {
    const best = new Set([...st.days].sort((a, b) => b.points - a.points || a.date.localeCompare(b.date)).slice(0, cfg.countedDays))
    for (const d of st.days) d.counted = best.has(d)
    st.points = [...best].reduce((a, d) => a + d.points, 0)
    st.gross = st.days.reduce((a, d) => a + d.points, 0)
    // fehlende frühere Renntage im Verlauf auffüllen (Fahrer erst später dazu)
    while (st.progress.length < dates.length) st.progress.unshift(null)
  }
  out.sort((a, b) => b.points - a.points || b.wins - a.wins || b.gross - a.gross || a.name.localeCompare(b.name))
  out.forEach((st, i) => {
    const prev = out[i - 1]
    st.rank = prev && prev.points === st.points && prev.wins === st.wins ? prev.rank : i + 1
  })
  return out
}

/** Konstrukteurswertung: Autos sammeln alle Rennpunkte ihrer Fahrer (ohne Streichresultate). */
export function constructorStandings(sessions: Session[], cfg = SEASON_POINTS): ConstructorStanding[] {
  const cars = new Map<string, ConstructorStanding & { names: Set<string> }>()
  for (const s of sessions) {
    if (isQualiSession(s)) continue
    for (const r of s.results) {
      const c = cars.get(r.car) ?? { car: r.car, points: 0, races: 0, wins: 0, drivers: 0, names: new Set<string>() }
      c.points += racePoints(s, r.position, cfg)
      c.races++
      if (r.position === 1 && s.results.length > 1) c.wins++
      if (!isGuest(r.driver)) c.names.add(r.driver)
      cars.set(r.car, c)
    }
  }
  return [...cars.values()]
    .map(({ names, ...c }) => ({ ...c, drivers: names.size }))
    .sort((a, b) => b.points - a.points || b.wins - a.wins)
}
