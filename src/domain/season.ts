import type { Session } from '../types'
import { isGuest } from './drivers'
import { quantile } from './laps'
import { RATING } from './rating'

/**
 * Saisonwertung mit Punkten – abgestimmt auf kleine Felder (meist 2–6 Fahrer), Renntage mit sehr
 * unterschiedlich vielen Rennen (1–9) und große Unterschiede im Tempo. Damit nicht immer der
 * Schnellste mit großem Abstand vorne liegt (abgeglichen an simulierten Saisons):
 * - pro Rennen je geschlagenem Gegner (auch Gäste) im Schnitt 1 Punkt: ein fester Teil plus ein Teil
 *   nach Stärke laut Elo mit Auto vor dem Rennen (gegen Stärkere mehr, gegen Schwächere weniger)
 * - kein Siegbonus
 * - pro Renntag zählen die besten `racesPerDay` Rennen
 * - Bonus pro Renntag: schnellste Runde und Pole, beide gemessen an der typischen Runde des eigenen
 *   Autos auf der Strecke; neue persönliche Bestzeit
 * - Streichresultate: Es zählen die besten `countedDays` Renntage
 * - Joker: Der beste gewertete Renntag zählt doppelt (statt eines Finales, das benachteiligt, wer am
 *   letzten Renntag nicht kann)
 */
export const SEASON_POINTS = {
  perBeaten: 1,
  /** Anteil nach Stärke (0 = nur Platz, 1 = nur Stärke): je Gegner `1 − fairShare` fest plus 0 bis `2 · fairShare` */
  fairShare: 0.6,
  racesPerDay: 3,
  fastestLap: 2,
  pole: 1,
  personalBest: 1,
  jokerFactor: 2,
  countedDays: 5,
}

export interface SeasonDay {
  date: string
  /** Punkte des Tages inkl. Bonus (ohne Joker) */
  points: number
  /** Punkte der gewerteten Rennen (ohne Bonus) */
  racePoints: number
  races: number
  fastestLap: boolean
  pole: boolean
  personalBest: boolean
  /** zählt zu den besten Renntagen (sonst Streichresultat) */
  counted: boolean
  /** bester gewerteter Renntag, zählt doppelt */
  joker: boolean
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

/** Was die Saisonwertung außer den Läufen des Jahres braucht */
export interface SeasonContext {
  /** Stärke im Lauf: Elo vor dem Lauf plus Autowertung; ohne gelten alle als gleich stark */
  strength?: (driver: string, car: string, s: Session) => number
  /** Neue persönliche Bestzeit an diesem Tag (es gab schon eine frühere) */
  personalBest?: (driver: string, date: string) => boolean
  /** Alle Läufe (auch frühere Jahre) für die typische Runde eines Autos; sonst nur die des Jahres */
  history?: Session[]
}

const isQualiSession = (s: Session) => /quali/i.test(s.type)
const round1 = (v: number) => Math.round(v * 10) / 10
const winProb = (a: number, b: number) => 1 / (1 + 10 ** ((b - a) / RATING.scale))

/** Rennpunkte eines Ergebnisses: je geschlagenem Gegner, nach Stärke gewichtet */
export function racePoints(s: Session, position: number, strength: (driver: string, car: string) => number, cfg = SEASON_POINTS): number {
  const me = s.results.find((r) => r.position === position)
  if (!me) return 0
  const own = strength(me.driver, me.car)
  let p = 0
  for (const o of s.results) {
    if (o.position <= position) continue
    p += cfg.perBeaten * (1 - cfg.fairShare + cfg.fairShare * 2 * (1 - winProb(own, strength(o.driver, o.car))))
  }
  return p
}

/** Mittlere saubere Runde aus mindestens 20 Runden, sonst null */
function typical(laps: number[]): number | null {
  if (laps.length < 20) return null
  return quantile([...laps].sort((a, b) => a - b), 0.5)
}

const cleanLaps = (sessions: Session[]) => sessions.flatMap((s) => s.results.flatMap((r) => r.lapTimes.filter((l) => l.status === 'normal').map((l) => l.ms)))

/**
 * Wer an diesen Läufen die beste Runde gemessen am eigenen Auto hatte: Bestzeit geteilt durch die
 * typische Runde des Autos auf der Strecke bis zu diesem Tag. Ohne genug Runden des Autos zählt die
 * typische Runde aller Autos des Tages auf der Strecke.
 */
function fastest(sessions: Session[], carLap: (track: string, car: string) => number | null): string | null {
  let best: { name: string; rel: number } | null = null
  for (const s of sessions) {
    for (const r of s.results) {
      if (isGuest(r.driver) || r.validBestLapMs == null) continue
      const ref = carLap(s.track, r.car)
      if (ref == null) continue
      const rel = r.validBestLapMs / ref
      if (!best || rel < best.rel) best = { name: r.driver, rel }
    }
  }
  return best?.name ?? null
}

/** Joker und Streichresultate setzen, Punkte mit Joker */
function countDays(days: SeasonDay[], cfg: typeof SEASON_POINTS): number {
  const best = [...days].sort((a, b) => b.points - a.points || a.date.localeCompare(b.date)).slice(0, cfg.countedDays)
  for (const d of days) {
    d.counted = best.includes(d)
    d.joker = d === best[0]
  }
  return round1(best.reduce((a, d) => a + d.points, 0) + (best[0] ? best[0].points * (cfg.jokerFactor - 1) : 0))
}

/** Saisonwertung für die Läufe eines Jahres (beliebige Reihenfolge). */
export function seasonStandings(sessions: Session[], ctx: SeasonContext = {}, cfg = SEASON_POINTS): SeasonStanding[] {
  const dates = [...new Set(sessions.map((s) => s.date))].sort()
  // Saubere Runden je Strecke und Auto
  const lapIndex = new Map<string, { date: string; ms: number }[]>()
  for (const s of ctx.history ?? sessions) {
    if (s.date > (dates.at(-1) ?? '')) continue
    for (const r of s.results) {
      const key = `${s.track}\u0000${r.car}`
      const list = lapIndex.get(key) ?? lapIndex.set(key, []).get(key)!
      for (const l of r.lapTimes) if (l.status === 'normal') list.push({ date: s.date, ms: l.ms })
    }
  }
  const byDriver = new Map<string, SeasonStanding>()
  const get = (name: string) =>
    byDriver.get(name) ??
    (byDriver.set(name, { name, points: 0, gross: 0, days: [], races: 0, wins: 0, podiums: 0, poles: 0, fastestLaps: 0, rank: 0, progress: [] }), byDriver.get(name)!)

  for (const date of dates) {
    const day = sessions.filter((s) => s.date === date)
    const races = day.filter((s) => !isQualiSession(s))
    const qualis = day.filter(isQualiSession)
    // Typische Runde je Auto und Strecke bis einschließlich heute
    const laps = new Map<string, number | null>()
    const carLap = (track: string, car: string) => {
      const key = `${track}\u0000${car}`
      if (!laps.has(key)) {
        const own = (lapIndex.get(key) ?? []).filter((x) => x.date <= date).map((x) => x.ms)
        laps.set(key, typical(own) ?? typical(cleanLaps(day.filter((s) => s.track === track))))
      }
      return laps.get(key)!
    }
    const pts = new Map<string, number[]>()
    for (const s of races) {
      const strength = (driver: string, car: string) => ctx.strength?.(driver, car, s) ?? RATING.start
      for (const r of s.results) {
        if (isGuest(r.driver)) continue
        pts.set(r.driver, [...(pts.get(r.driver) ?? []), racePoints(s, r.position, strength, cfg)])
        const st = get(r.driver)
        st.races++
        if (r.position === 1 && s.results.length > 1) st.wins++
        if (r.position <= 3 && s.results.length > 3) st.podiums++
      }
    }
    const fl = fastest(races, carLap)
    const pole = qualis.length ? fastest(qualis, carLap) : null
    const present = new Set([...pts.keys(), ...qualis.flatMap((s) => s.results.map((r) => r.driver)).filter((n) => !isGuest(n))])
    for (const name of present) {
      const list = (pts.get(name) ?? []).sort((a, b) => b - a)
      const racePts = list.slice(0, cfg.racesPerDay).reduce((a, b) => a + b, 0)
      const pb = ctx.personalBest?.(name, date) ?? false
      const bonus = (name === fl ? cfg.fastestLap : 0) + (name === pole ? cfg.pole : 0) + (pb ? cfg.personalBest : 0)
      const st = get(name)
      if (name === fl) st.fastestLaps++
      if (name === pole) st.poles++
      st.days.push({ date, points: round1(racePts + bonus), racePoints: round1(racePts), races: list.length, fastestLap: name === fl, pole: name === pole, personalBest: pb, counted: false, joker: false })
    }
    // Zwischenstand nach diesem Renntag (mit Streichresultaten und Joker)
    for (const st of byDriver.values()) st.progress.push(st.days.length ? countDays(st.days, cfg) : null)
  }

  const out = [...byDriver.values()]
  for (const st of out) {
    st.points = countDays(st.days, cfg)
    st.gross = round1(st.days.reduce((a, d) => a + d.points, 0))
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

/** Konstrukteurswertung: Autos sammeln je Rennen 1 Punkt je geschlagenem Gegner, Sieg +1 (ohne Streichresultate). */
export function constructorStandings(sessions: Session[]): ConstructorStanding[] {
  const cars = new Map<string, ConstructorStanding & { names: Set<string> }>()
  for (const s of sessions) {
    if (isQualiSession(s)) continue
    for (const r of s.results) {
      const c = cars.get(r.car) ?? { car: r.car, points: 0, races: 0, wins: 0, drivers: 0, names: new Set<string>() }
      const won = r.position === 1 && s.results.length > 1
      c.points += s.results.filter((x) => x.position > r.position).length + (won ? 1 : 0)
      c.races++
      if (won) c.wins++
      if (!isGuest(r.driver)) c.names.add(r.driver)
      cars.set(r.car, c)
    }
  }
  return [...cars.values()]
    .map(({ names, ...c }) => ({ ...c, drivers: names.size }))
    .sort((a, b) => b.points - a.points || b.wins - a.wins)
}
