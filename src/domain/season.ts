import type { Session } from '../types'
import { isGuest } from './drivers'
import { quantile } from './laps'
import { RATING } from './rating'

/**
 * Saisonwertung mit Punkten – abgestimmt auf kleine Felder (meist 2–6 Fahrer), Renntage mit sehr
 * unterschiedlich vielen Rennen (1–9) und große Unterschiede im Tempo. Damit nicht immer der
 * Schnellste mit großem Abstand vorne liegt (abgeglichen an simulierten Saisons):
 * - pro Rennen je geschlagenem Gegner (auch Gäste) im Schnitt 1 Punkt: ein fester Teil plus ein Teil
 *   nach Stärke laut Elo mit Auto vor dem Rennen (gegen Stärkere mehr, gegen Schwächere weniger);
 *   es zählen höchstens die `maxBeaten` wertvollsten geschlagenen Gegner – große Felder bringen so
 *   nicht mehr als ein 4er-Feld
 * - kein Siegbonus
 * - Es zählen die besten `countedRaces` Rennen der Saison, höchstens `racesPerDay` pro Renntag. Wer
 *   nur einen Tag da war und dort gut fuhr, wird so nicht übergewichtet – wer öfter kommt, kann mehr
 *   Rennen werten.
 * - Dazu `perChallenge` Punkte je geschaffter Saison-Challenge (rechnet das Modell dazu). Pole und
 *   schnellste Runde werden nur noch gezählt, bringen aber keine Punkte.
 */
export const SEASON_POINTS = {
  perBeaten: 1,
  /** Anteil nach Stärke (0 = nur Platz, 1 = nur Stärke): je Gegner `1 − fairShare` fest plus 0 bis `2 · fairShare` */
  fairShare: 0.6,
  /** höchstens so viele geschlagene Gegner zählen je Rennen (die wertvollsten) */
  maxBeaten: 3,
  /** höchstens so viele Rennen zählen je Renntag */
  racesPerDay: 3,
  /** so viele Rennen zählen in der Saison */
  countedRaces: 5,
  /** Punkte je geschaffter Saison-Challenge */
  perChallenge: 1,
}

/** Punkte eines Rennens in der Saisonwertung */
export interface SeasonRace {
  fileId: string
  date: string
  /** „Rennen 2“ */
  label: string
  points: number
}

export interface SeasonDay {
  date: string
  /** Punkte der besten `racesPerDay` Rennen des Tages */
  points: number
  /** = points (Rennpunkte des Tages) */
  racePoints: number
  races: number
  /** Rennen des Tages, beste zuerst */
  raceList: SeasonRace[]
  /** Davon in der Saison gewertete Rennen */
  countedRaces: number
  fastestLap: boolean
  pole: boolean
  /** mindestens ein Rennen des Tages zählt */
  counted: boolean
}

export interface SeasonStanding {
  name: string
  /** Rennpunkte plus Challenge-Punkte */
  points: number
  /** Punkte der gewerteten Rennen */
  racePoints: number
  /** Gewertete Rennen in zeitlicher Folge */
  counted: SeasonRace[]
  /** Geschaffte Saison-Challenges und ihre Punkte (setzt das Modell) */
  challenges: number
  challengePoints: number
  /** Punkte, wenn alle Renntage (je beste `racesPerDay` Rennen) zählten */
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
  const each: number[] = []
  for (const o of s.results) {
    if (o.position <= position) continue
    each.push(cfg.perBeaten * (1 - cfg.fairShare + cfg.fairShare * 2 * (1 - winProb(own, strength(o.driver, o.car)))))
  }
  return each
    .sort((a, b) => b - a)
    .slice(0, cfg.maxBeaten)
    .reduce((a, b) => a + b, 0)
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

/** Gewertete Rennen: je Renntag die besten `racesPerDay`, davon die besten `countedRaces` der Saison */
function countRaces(st: SeasonStanding, cfg: typeof SEASON_POINTS): number {
  const pool = st.days.flatMap((d) => d.raceList.slice(0, cfg.racesPerDay))
  // Rennen ohne Punkte zählen nicht als gewertet (bringen nichts und wären nur leere Chips)
  const best = pool.filter((r) => r.points > 0).sort((a, b) => b.points - a.points || a.date.localeCompare(b.date)).slice(0, cfg.countedRaces)
  for (const d of st.days) {
    d.countedRaces = best.filter((r) => r.date === d.date).length
    d.counted = d.countedRaces > 0
  }
  st.counted = [...best].sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label, 'de', { numeric: true }))
  return round1(best.reduce((a, r) => a + r.points, 0))
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
    (byDriver.set(name, { name, points: 0, racePoints: 0, counted: [], challenges: 0, challengePoints: 0, gross: 0, days: [], races: 0, wins: 0, podiums: 0, poles: 0, fastestLaps: 0, rank: 0, progress: [] }), byDriver.get(name)!)

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
    const pts = new Map<string, SeasonRace[]>()
    for (const s of races) {
      const strength = (driver: string, car: string) => ctx.strength?.(driver, car, s) ?? RATING.start
      for (const r of s.results) {
        if (isGuest(r.driver)) continue
        const race: SeasonRace = { fileId: s.fileId, date, label: `${s.type} ${s.heat}`, points: round1(racePoints(s, r.position, strength, cfg)) }
        pts.set(r.driver, [...(pts.get(r.driver) ?? []), race])
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
      const list = (pts.get(name) ?? []).sort((a, b) => b.points - a.points)
      const racePts = round1(list.slice(0, cfg.racesPerDay).reduce((a, r) => a + r.points, 0))
      const st = get(name)
      if (name === fl) st.fastestLaps++
      if (name === pole) st.poles++
      st.days.push({ date, points: racePts, racePoints: racePts, races: list.length, raceList: list, countedRaces: 0, fastestLap: name === fl, pole: name === pole, counted: false })
    }
    // Zwischenstand nach diesem Renntag (beste Rennen bis hierhin)
    for (const st of byDriver.values()) st.progress.push(st.days.length ? countRaces(st, cfg) : null)
  }

  const out = [...byDriver.values()]
  for (const st of out) {
    st.racePoints = countRaces(st, cfg)
    st.points = st.racePoints
    st.gross = round1(st.days.reduce((a, d) => a + d.points, 0))
    // fehlende frühere Renntage im Verlauf auffüllen (Fahrer erst später dazu)
    while (st.progress.length < dates.length) st.progress.unshift(null)
  }
  return rankStandings(out)
}

/** Sortiert nach Punkten, Siegen, Punkten aller Tage und Name und vergibt die Plätze */
export function rankStandings(out: SeasonStanding[]): SeasonStanding[] {
  out.sort((a, b) => b.points - a.points || b.wins - a.wins || b.gross - a.gross || a.name.localeCompare(b.name))
  out.forEach((st, i) => {
    const prev = out[i - 1]
    st.rank = prev && prev.points === st.points && prev.wins === st.wins ? prev.rank : i + 1
  })
  return out
}

/** Konstrukteurswertung: Autos sammeln je Rennen 1 Punkt je geschlagenem Gegner, Sieg +1 (alle Rennen zählen). */
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
