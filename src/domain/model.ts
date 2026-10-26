import { formatTime } from '../data/time'
import type { Result, Session } from '../types'
import { isGuest } from './drivers'
import { crashObservations, estimateCars, fitCars, lossObservations, lostMs, paceObservations, type CarFit } from './carModel'
import { carTraits, radarAxes, type RadarAxis } from './carProfile'
export type { RadarAxis } from './carProfile'
import { quantile, SPLIT_LAPS } from './laps'
import { buildSplits, fmtMark, markNext, markReached, SPLIT_REWARDS_FROM, splitKey, type Splits } from './splits'
import { constructorStandings, seasonStandings, type ConstructorStanding, type SeasonStanding } from './season'
import { CHALLENGE_XP, seasonChallenges, type Challenge } from './challenges'
import { carKey, computeRatings, isQuali, RATING, sortSessions, type RatingEvent, type RatingResult } from './rating'

/** „all“ oder ein Jahr wie „2025“ */
export type Period = string

const inPeriod = (date: string, period: Period) => period === 'all' || date.startsWith(period)
const median = (xs: number[]) => (xs.length ? quantile([...xs].sort((a, b) => a - b), 0.5) : null)
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const normalLaps = (r: Result) => r.lapTimes.filter((l) => l.status === 'normal').map((l) => l.ms)

function cv(xs: number[]): number | null {
  if (xs.length < 4) return null
  const m = mean(xs)!
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))!) / m
}

export interface CarUse {
  races: number
  wins: number
  laps: number
  /** Kilometer in Rennen und Qualifyings */
  km: number
  bestLapMs: number | null
  normal: number[]
}

export interface DriverStats {
  name: string
  races: number
  wins: number
  podiums: number
  qualis: number
  poles: number
  /** Anteil geschlagener Gegner über alle Rennen (normiert auf die Feldgröße), 0–1 */
  beatShare: number | null
  /** Ø Platzierung in Rennen */
  avgPosition: number | null
  laps: number
  km: number | null
  bestLapMs: number | null
  /** Ø saubere Runde in % der typischen Streckenbestzeit (100 = Referenz) */
  pace: number | null
  /** Ø saubere Runde minus typische Streckenbestzeit in ms (Pace in Sekunden) */
  paceGap: number | null
  /** Schwankung sauberer Runden, z. B. 0.07 = 7 % */
  precision: number | null
  crashes: number
  /** Runden aus Rennen ohne Tankfunktion (Basis für die Abflugquote) */
  crashBaseLaps: number
  crashRate: number | null
  crashLossMs: number
  cars: Map<string, CarUse>
  favoriteCar: string | null
  opponentsMet: Set<string>
  opponentsBeaten: Set<string>
  h2h: Map<string, [number, number]>
  raceDays: Set<string>
  streak: number
  maxStreak: number
  /** Lauf-IDs der Rennen in Reihenfolge, für Serien-Auswertungen */
  raceResults: { session: Session; result: Result }[]
}

export interface CarStats {
  name: string
  races: number
  qualis: number
  wins: number
  podiums: number
  winRate: number | null
  beatShare: number | null
  avgPosition: number | null
  laps: number
  km: number | null
  bestLapMs: number | null
  bestBy: string | null
  pace: number | null
  paceGap: number | null
  /** Ø Präzision der Fahrer mit diesem Auto */
  spread: number | null
  /** Sauberes Tempo, fahrer- und laufbereinigt: ms pro Runde gegenüber dem Ø Auto (minus = schneller) */
  tempo: number | null
  /** Abflüge pro 100 Runden, fahrer- und laufbereinigt (nur Rennen ohne Tankfunktion) */
  crashRate: number | null
  /** Netzdiagramm: Tempo, Spitzenrunden, Konstanz, Reifen, Sicherheit (0,5 = Ø Auto) */
  radar: RadarAxis[]
  rating: number | null
  /** Autowertung noch vorläufig: weniger als CAR_PROVISIONAL_RACES Rennen insgesamt */
  provisional: boolean
  /** Neutral, nicht bereinigt: verlorene Zeit durch Abflüge und Defekte in Sekunden je 10 Runden (Rennen ohne Tank) */
  lossPer10: number | null
  /** 0 = kein Bonus, 1–3 = Underdog-Bonus */
  bonus: number
  /** Je Fahrer mit diesem Auto: Rennen, Siege, km (Rennen und Qualis), Bestzeit, saubere Runden */
  drivers: Map<string, { races: number; wins: number; km: number; bestLapMs: number | null; normal: number[] }>
}

export interface RankRow {
  name: string
  elo: number
  /** Platz unter den Eingestuften; Fahrer in der Einstufung stehen dahinter (Platz nur zur Sortierung) */
  rank: number
  rankStart: number | null
  races: number
  /** Noch in der Einstufung: kein Platz in der Rangliste */
  placing: boolean
}

export type StatusCode =
  | 'crown' | 'flame' | 'record-track' | 'record-car' | 'record-personal' | 'up' | 'giant'
  | 'comeback' | 'pole' | 'precision' | 'clean' | 'form' | 'rookie' | 'ice' | 'hunter'

export interface Status {
  code: StatusCode
  /** Zahl für Flamme (Serie) und Chevrons (Plätze) */
  value?: number
  label: string
}

export type Tier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond'
export const TIER_ORDER: Tier[] = ['bronze', 'silver', 'gold', 'platinum', 'diamond']

export interface Medal {
  id: string
  kind: string
  name: string
  description: string
  tier: Tier
  /** Erreicht am (Stufen) bzw. Titel seit */
  date: string
  /** Titel mit genau einem Inhaber (wechselt mit dem aktuellen Stand) */
  title?: boolean
  /** Ehemaliger Titel (Wanderpokal), mit Zeitraum */
  former?: { from: string; to: string }
  icon: 'trophy' | 'track' | 'clock' | 'people' | 'sword' | 'flag' | 'target' | 'shield' | 'car' | 'flame' | 'star' | 'road' | 'chevrons'
}

export interface Goal {
  label: string
  detail: string
  progress: number
}

export interface RecordEntry {
  ms: number
  driver: string
  car: string
  date: string
  fileId: string
  guest: boolean
}

export interface Tip {
  title: string
  text: string
  /** Lob statt Verbesserungstipp */
  good?: boolean
}

export interface Career {
  xp: number
  level: number
  title: string
  /** XP, ab denen das aktuelle bzw. nächste Level erreicht ist */
  levelXp: number
  nextXp: number
  breakdown: { label: string; count: number; xp: number }[]
}

/** XP-Regeln für das Karriere-Level: Jedes Mitfahren zählt, nichts geht verloren */
export const CAREER_XP = { race: 10, quali: 4, raceDay: 15, win: 10, podium: 5, km: 5, personalBest: 10 }
/** XP, ab denen ein Level erreicht ist */
export const levelXp = (level: number) => 25 * level * (level - 1)
const CAREER_TITLES: [number, string][] = [[15, 'Legende'], [10, 'Profi'], [7, 'Routinier'], [5, 'Stammfahrer'], [3, 'Hobbyfahrer'], [1, 'Rookie']]
export const careerTitle = (level: number) => CAREER_TITLES.find(([min]) => level >= min)![1]
/** Nächster Titel über dem aktuellen Level: [ab Level, Titel] oder null bei „Legende“ */
export const nextCareerTitle = (level: number) => [...CAREER_TITLES].reverse().find(([min]) => min > level) ?? null

export type { ConstructorStanding, SeasonStanding } from './season'
export type { Challenge } from './challenges'

/** Jahresrückblick eines Fahrers */
export interface Wrapped {
  driver: string
  year: string
  races: number
  qualis: number
  days: number
  laps: number
  km: number | null
  wins: number
  podiums: number
  season: SeasonStanding | null
  seasonSize: number
  favoriteCar: { name: string; races: number } | null
  /** Bestes Rennen: Sieg mit den meisten geschlagenen Gegnern bzw. bestes Ergebnis */
  bestRace: { session: Session; result: Result; beaten: number } | null
  /** Am häufigsten geschlagener Gegner und wer einen am häufigsten geschlagen hat */
  victim: { name: string; count: number; wins: number; losses: number } | null
  nemesis: { name: string; count: number; wins: number; losses: number } | null
  bestLap: { ms: number; car: string; date: string } | null
  /** Verbesserung der persönlichen Bestzeit im Jahr (ms), null = keine */
  pbGain: number | null
  eloStart: number | null
  eloEnd: number | null
  crashes: number
  crashRate: number | null
  medals: Medal[]
  challenges: Challenge[]
  /** Je Renntag des Fahrers: Rennen, Siege, beste Runde, Abflüge (für kleine Diagramme) */
  perDay: { date: string; races: number; wins: number; bestLapMs: number | null; crashes: number }[]
  /** Elo nach jedem Lauf im Jahr */
  elo: { date: string; value: number; label: string }[]
  /** Gefahrene Autos im Jahr (Rennen) */
  cars: { name: string; races: number }[]
  /** Renntag mit den meisten Saisonpunkten */
  bestDay: { date: string; points: number; races: number; wins: number } | null
  /** Größter Elo-Sprung im Jahr (ohne Einstufungsläufe) */
  moment: { date: string; delta: number; reason: string; fileId: string; position: number; field: number; type: string; car: string } | null
  /** Vergleich mit dem Vorjahr (wenn der Fahrer da auch gefahren ist) */
  prev: { year: string; races: number; wins: number; bestLapMs: number | null; rank: number | null; km: number | null } | null
  /** Platz der schnellsten Runde unter allen Fahrern des Jahres auf derselben Strecke */
  lapRank: { rank: number; of: number; track: string } | null
  /** Fahrerprofil (Netzdiagramm über alle Jahre) */
  radar: RadarAxis[]
  /** Bestmarken über 10/20 Runden im Jahr (Hauptstrecke), mit Vorjahresstand und geknackten Zeitmarken */
  splits: { n: number; ms: number; date: string; car: string; before: number | null; marks: number[]; rank: number; of: number }[]
}

export interface NewsItem {
  kind: 'medal' | 'record-track' | 'record-car' | 'record-personal' | 'climb' | 'split-record' | 'split'
  driver: string
  title: string
  detail: string
  medal?: Medal
  value?: number
}

export interface Model {
  sessions: Session[]
  years: string[]
  tracks: string[]
  rating: RatingResult
  drivers: string[]
  stats: (period: Period) => { drivers: Map<string, DriverStats>; cars: Map<string, CarStats> }
  ranking: (period: Period) => RankRow[]
  statuses: (period: Period) => Map<string, Status[]>
  medals: Map<string, Medal[]>
  trackRecords: Map<string, RecordEntry>
  carRecords: Map<string, RecordEntry>
  goals: (driver: string) => Goal[]
  rival: (driver: string) => { name: string; wins: number; losses: number } | null
  /** Tipps und Lob zum Durchwischen, Verbesserungstipps zuerst */
  tips: (driver: string) => Tip[]
  eloAt: (driver: string, date: string) => number | null
  /** Rang aller Fahrer an jedem Renntag */
  rankTimeline: () => { dates: string[]; ranks: Map<string, (number | null)[]> }
  /** Was am letzten Renntag passiert ist */
  news: () => NewsItem[]
  /** Saisonwertung mit Punkten und Streichresultaten */
  season: (year: string) => SeasonStanding[]
  /** Konstrukteurswertung: Punkte der Autos im Jahr */
  constructors: (year: string) => ConstructorStanding[]
  /** Saison-Challenges eines Fahrers */
  challenges: (driver: string, year: string) => Challenge[]
  /** Jahresrückblick („Wrapped“) */
  wrapped: (driver: string, year: string) => Wrapped | null
  /** Fahrstil im Netzdiagramm: Perzentil unter den Stammfahrern je Stärke (außen = besser) */
  driverRadar: (driver: string) => RadarAxis[]
  /** Karriere-Level aus Erfahrungspunkten (steigt nur) */
  career: (driver: string) => Career | null
  /**
   * Einstufung neuer Fahrer: Nummer des Einstufungslaufs (ab 1) für einen Lauf (`fileId`) bzw.
   * ohne `fileId` die Zahl der bisher gefahrenen Läufe, solange die Einstufung läuft – sonst null.
   */
  placement: (driver: string, fileId?: string) => number | null
  /** Zahl der Einstufungsläufe eines Fahrers (8; wer vor RATING.v2From begann: 5) */
  placementRuns: (driver: string) => number
  /**
   * Eigener Fortschritt unabhängig von den anderen: Wie viel schneller (Prozent, + = schneller) die
   * sauberen Runden in den letzten Rennen sind als in den ersten – jeweils gemessen an der typischen
   * Runde des gefahrenen Autos auf der Strecke. null bei zu wenigen Rennen.
   */
  progress: (driver: string) => { pct: number; races: number } | null
  /** Gesamtzeiten über 10/20 Runden: Bestmarken, Rekorde, Zeitmarken */
  splits: Splits
  /** Strecke, auf der ein Fahrer zuletzt 10/20-Runden-Zeiten gefahren ist (bis `upTo`) */
  splitTrack: (driver: string, upTo?: string) => string | null
}

/** Läufe, bis die Wertung eines neuen Fahrers eingependelt ist */
export const PLACEMENT_RUNS = RATING.provisionalRaces

/** Autowertung gilt als vorläufig, solange ein Auto weniger Rennen hat (Tempo hat nach etwa 10 Läufen die halbe Wirkung) */
export const CAR_PROVISIONAL_RACES = 10

/** Rekord-Tipps nur in Reichweite: Rückstand höchstens so viel (Anteil der Rekordzeit) */
const RECORD_REACH = { track: 0.025, car: 0.05 }


function emptyDriver(name: string): DriverStats {
  return {
    name, races: 0, wins: 0, podiums: 0, qualis: 0, poles: 0, beatShare: null, avgPosition: null, laps: 0, km: null,
    bestLapMs: null, pace: null, paceGap: null, precision: null, crashes: 0, crashBaseLaps: 0, crashRate: null,
    crashLossMs: 0, cars: new Map(), favoriteCar: null, opponentsMet: new Set(), opponentsBeaten: new Set(),
    h2h: new Map(), raceDays: new Set(), streak: 0, maxStreak: 0, raceResults: [],
  }
}

/** Typische Bestzeit (10. Perzentil gültiger Runden) pro Strecke – Basis für den Pace-Index. */
function trackReferences(sessions: Session[]) {
  const pools = new Map<string, number[]>()
  for (const s of sessions) {
    const list = pools.get(s.track) ?? []
    for (const r of s.results) for (const l of r.lapTimes) if (l.status !== 'invalid') list.push(l.ms)
    pools.set(s.track, list)
  }
  return new Map([...pools].map(([t, xs]) => [t, quantile(xs.sort((a, b) => a - b), 0.1)]))
}

export function buildModel(input: Session[]): Model {
  const sessions = sortSessions(input)
  const rating = computeRatings(sessions)
  const carRacesAll = new Map<string, number>()
  for (const x of sessions) if (!isQuali(x)) for (const r of x.results) carRacesAll.set(r.car, (carRacesAll.get(r.car) ?? 0) + 1)
  const trackRef = trackReferences(sessions)
  const years = [...new Set(sessions.map((s) => s.date.slice(0, 4)))].sort().reverse()
  const tracks = [...new Set(sessions.map((s) => s.track))]
  const drivers = [...rating.history.keys()]

  // ---- Kennzahlen pro Zeitraum ---------------------------------------------------------
  const statsCache = new Map<Period, ReturnType<Model['stats']>>()
  const stats = (period: Period) => {
    const cached = statsCache.get(period)
    if (cached) return cached
    const ds = new Map<string, DriverStats>()
    const cs = new Map<string, CarStats>()
    const get = (n: string) => ds.get(n) ?? (ds.set(n, emptyDriver(n)), ds.get(n)!)
    const getCar = (n: string): CarStats =>
      cs.get(n) ?? (cs.set(n, { name: n, races: 0, qualis: 0, wins: 0, podiums: 0, winRate: null, beatShare: null, avgPosition: null, laps: 0, km: null, bestLapMs: null, bestBy: null, pace: null, paceGap: null, spread: null, tempo: null, crashRate: null, radar: [], rating: null, provisional: true, lossPer10: null, bonus: 0, drivers: new Map() }), cs.get(n)!)
    const beat = new Map<string, number[]>()
    const carBeat = new Map<string, number[]>()
    const positions = new Map<string, number[]>()
    const carPositions = new Map<string, number[]>()
    const push = (m: Map<string, number[]>, k: string, v: number) => (m.get(k) ?? m.set(k, []).get(k)!).push(v)
    const push2 = <T,>(m: Map<string, T[]>, k: string, v: T) => (m.get(k) ?? m.set(k, []).get(k)!).push(v)
    const paceSamples = new Map<string, number[]>()
    const gapSamples = new Map<string, number[]>()
    const carGap = new Map<string, number[]>()
    const carPace = new Map<string, number[]>()
    const precSamples = new Map<string, number[]>()
    const carPrec = new Map<string, number[]>()

    for (const s of sessions) {
      if (!inPeriod(s.date, period)) continue
      const quali = isQuali(s)
      const ref = trackRef.get(s.track) ?? null
      for (const r of s.results) {
        const car = getCar(r.car)
        const nl = normalLaps(r)
        const valid = r.lapTimes.filter((l) => l.status !== 'invalid').map((l) => l.ms)
        const best = valid.length ? Math.min(...valid) : null
        const km = s.trackLengthCm ? (r.laps * s.trackLengthCm) / 100000 : null
        car.laps += r.laps
        if (km != null) car.km = (car.km ?? 0) + km
        if (best != null && (car.bestLapMs == null || best < car.bestLapMs)) { car.bestLapMs = best; car.bestBy = r.driver }
        const c = cv(nl)
        if (c != null) (carPrec.get(r.car) ?? carPrec.set(r.car, []).get(r.car)!).push(c)
        const med = median(nl)
        if (med != null && ref) (carPace.get(r.car) ?? carPace.set(r.car, []).get(r.car)!).push((med / ref) * 100)
        if (med != null && ref) push(carGap, r.car, med - ref)
        const dEntry = car.drivers.get(r.driver) ?? { races: 0, wins: 0, km: 0, bestLapMs: null, normal: [] }
        if (!quali) dEntry.races++
        if (!quali && r.position === 1 && s.results.length > 1) dEntry.wins++
        if (km != null) dEntry.km += km
        if (best != null && (dEntry.bestLapMs == null || best < dEntry.bestLapMs)) dEntry.bestLapMs = best
        dEntry.normal.push(...nl)
        car.drivers.set(r.driver, dEntry)
        const share = s.results.length > 1 ? (s.results.length - r.position) / (s.results.length - 1) : null
        if (quali) car.qualis++
        if (!quali) {
          car.races++
          if (r.position === 1) car.wins++
          if (r.position <= 3) car.podiums++
          push(carPositions, r.car, r.position)
          if (share != null) (carBeat.get(r.car) ?? carBeat.set(r.car, []).get(r.car)!).push(share)
        }

        if (isGuest(r.driver)) continue
        const d = get(r.driver)
        d.laps += r.laps
        if (km != null) d.km = (d.km ?? 0) + km
        if (best != null && (d.bestLapMs == null || best < d.bestLapMs)) d.bestLapMs = best
        const use = d.cars.get(r.car) ?? { races: 0, wins: 0, laps: 0, km: 0, bestLapMs: null, normal: [] }
        use.laps += r.laps
        if (km != null) use.km += km
        use.normal.push(...nl)
        if (best != null && (use.bestLapMs == null || best < use.bestLapMs)) use.bestLapMs = best
        if (c != null) (precSamples.get(r.driver) ?? precSamples.set(r.driver, []).get(r.driver)!).push(c)
        if (med != null && ref) (paceSamples.get(r.driver) ?? paceSamples.set(r.driver, []).get(r.driver)!).push((med / ref) * 100)
        if (med != null && ref) push(gapSamples, r.driver, med - ref)
        if (quali) {
          d.qualis++
          if (r.position === 1) d.poles++
        } else {
          d.races++
          d.raceDays.add(s.date)
          d.raceResults.push({ session: s, result: r })
          use.races++
          if (r.position === 1) { d.wins++; use.wins++; d.streak++; d.maxStreak = Math.max(d.maxStreak, d.streak) } else d.streak = 0
          if (r.position <= 3) d.podiums++
          push(positions, r.driver, r.position)
          if (share != null) (beat.get(r.driver) ?? beat.set(r.driver, []).get(r.driver)!).push(share)
          for (const o of s.results) {
            if (o === r || isGuest(o.driver)) continue
            d.opponentsMet.add(o.driver)
            const hh = d.h2h.get(o.driver) ?? [0, 0]
            if (r.position < o.position) { d.opponentsBeaten.add(o.driver); hh[0]++ } else hh[1]++
            d.h2h.set(o.driver, hh)
          }
          if (!s.tank) {
            d.crashBaseLaps += r.laps
            for (const l of r.lapTimes) if (l.status === 'crash') { d.crashes++; d.crashLossMs += l.lossMs ?? 0 }
          }
        }
        d.cars.set(r.car, use)
      }
    }
    for (const d of ds.values()) {
      d.beatShare = mean(beat.get(d.name) ?? [])
      d.avgPosition = mean(positions.get(d.name) ?? [])
      d.pace = mean(paceSamples.get(d.name) ?? [])
      d.paceGap = mean(gapSamples.get(d.name) ?? [])
      d.precision = mean(precSamples.get(d.name) ?? [])
      d.crashRate = d.crashBaseLaps >= 20 ? (d.crashes / d.crashBaseLaps) * 100 : null
      d.favoriteCar = [...d.cars].sort((a, b) => b[1].races - a[1].races || b[1].laps - a[1].laps)[0]?.[0] ?? null
    }
    // Autowertung: Mittel über Strecken, gewichtet nach Rennen
    // Mittel über die Strecken, auf denen das Auto gefahren ist
    const byCar = <T,>(m: Map<string, T>) => {
      const out = new Map<string, T[]>()
      for (const [key, v] of m) push2(out, key.split('\u0000')[1], v)
      return out
    }
    const carRatings = new Map([...byCar(rating.cars)].map(([car, vs]) => [car, mean(vs)!]))

    // Fahrer- und laufbereinigtes Tempo und Abflüge (Stand Ende des Zeitraums, neuere Läufe zählen mehr)
    const inP = sessions.filter((x) => inPeriod(x.date, period))
    const asOf = inP.reduce((m, x) => (x.date > m ? x.date : m), '')
    const crashObs = crashObservations(inP, carKey, isQuali)
    const est = estimateCars(paceObservations(inP, carKey, isQuali, RATING.qualiWeight), lossObservations(inP, carKey, isQuali), {
      asOf, halfLifeDays: RATING.carHalfLifeDays, prior: RATING.carPrior, trendPrior: RATING.carTrendPrior,
      consistency: RATING.carConsistency,
    })
    const paceFit = est.pace
    // Abflüge pro 100 Runden zur Anzeige – geglättet wie der Zeitverlust
    const crashFit = fitCars(crashObs, asOf, RATING.carHalfLifeDays, RATING.carPrior.loss, RATING.carTrendPrior.loss, RATING.carConsistency)
    const baseCrash = crashObs.length ? crashObs.reduce((a, o) => a + o.y, 0) / crashObs.length : null
    const weighted = (fit: CarFit, value: (key: string, e: number) => number | null) => {
      const acc = new Map<string, [number, number]>()
      for (const [key, e] of fit.effect) {
        const v = value(key, e)
        const w = fit.weight.get(key) ?? 0
        if (v == null || !w) continue
        const car = key.split('\u0000')[1]
        const a = acc.get(car) ?? [0, 0]
        acc.set(car, [a[0] + v * w, a[1] + w])
      }
      return new Map([...acc].map(([car, [sum, w]]) => [car, sum / w]))
    }
    const traits = carTraits(inP, isQuali)
    // Zeitverlust je Auto, neutral: Summe der Verluste durch Abflüge/Defekte und Zahl der Runden
    const carLoss = new Map<string, [number, number]>()
    for (const x of inP) {
      if (isQuali(x) || x.tank) continue
      for (const r of x.results) {
        const nl = r.lapTimes.filter((l) => l.status === 'normal').map((l) => l.ms).sort((p, q) => p - q)
        if (nl.length < 3) continue
        const a = carLoss.get(r.car) ?? [0, 0]
        a[0] += lostMs(r.lapTimes, quantile(nl, 0.5))
        a[1] += r.lapTimes.length
        carLoss.set(r.car, a)
      }
    }
    const carTempo = weighted(paceFit, (key, e) => {
      const ref = trackRef.get(key.split('\u0000')[0])
      return ref ? (Math.exp(e) - 1) * ref : null
    })
    const carCrash = weighted(crashFit, (_, e) => (baseCrash != null ? Math.max(0, baseCrash + e) * 100 : null))
    for (const c of cs.values()) {
      c.winRate = c.races ? c.wins / c.races : null
      c.beatShare = mean(carBeat.get(c.name) ?? [])
      c.avgPosition = mean(carPositions.get(c.name) ?? [])
      c.pace = mean(carPace.get(c.name) ?? [])
      c.paceGap = mean(carGap.get(c.name) ?? [])
      c.spread = mean(carPrec.get(c.name) ?? [])
      c.tempo = carTempo.get(c.name) ?? null
      c.crashRate = carCrash.get(c.name) ?? null
      c.radar = radarAxes(c.tempo, c.crashRate, baseCrash != null ? baseCrash * 100 : null, traits.get(c.name))
      c.rating = carRatings.get(c.name) ?? null
      c.provisional = (carRacesAll.get(c.name) ?? 0) < CAR_PROVISIONAL_RACES
      const lost = carLoss.get(c.name)
      c.lossPer10 = lost && lost[1] >= 50 ? (lost[0] / lost[1]) * 10 / 1000 : null
      // feste Schwellen: nur spürbar schwächere Autos (6 Punkte ≈ 0,75 % langsamere Runden)
      const r = c.rating ?? 0
      c.bonus = c.races < 3 ? 0 : r <= -18 ? 3 : r <= -12 ? 2 : r <= -6 ? 1 : 0
    }
    const result = { drivers: ds, cars: cs }
    statsCache.set(period, result)
    return result
  }

  // ---- Wertung zu einem Zeitpunkt --------------------------------------------------------
  const eloAt = (driver: string, date: string): number | null => {
    let v: number | null = null
    for (const e of rating.history.get(driver) ?? []) if (e.date <= date) v = e.after
    return v
  }
  /** Noch in der Einstufung (zum Stand dieses Tages) */
  const placingAt = (driver: string, date: string) => (rating.history.get(driver) ?? []).filter((e) => e.date <= date).length < rating.placementRuns(driver)
  /**
   * Rangfolge nach Elo an einem Tag. `rankedOnly`: ohne Fahrer in der Einstufung (für Ranglisten und
   * Anzeigen) – Medaillen rechnen wie bisher mit allen, damit sich nichts rückwirkend ändert.
   */
  const rankingAt = (date: string, rankedOnly = false) => {
    const rows = drivers
      .filter((n) => !rankedOnly || !placingAt(n, date))
      .map((n) => ({ name: n, elo: eloAt(n, date) }))
      .filter((r): r is { name: string; elo: number } => r.elo != null)
    rows.sort((a, b) => b.elo - a.elo)
    return new Map(rows.map((r, i) => [r.name, i + 1]))
  }
  const dates = [...new Set(sessions.map((s) => s.date))].sort()
  const periodEnd = (period: Period) => (period === 'all' ? dates[dates.length - 1] ?? '' : `${period}-12-31`)
  const periodStart = (period: Period) => {
    if (period === 'all') return dates.length > 1 ? dates[dates.length - 2] : null
    const prev = dates.filter((d) => d < `${period}-01-01`)
    return prev.length ? prev[prev.length - 1] : null
  }
  const ranking = (period: Period): RankRow[] => {
    const end = periodEnd(period)
    const start = periodStart(period)
    const endRanks = rankingAt(end, true)
    const startRanks = start ? rankingAt(start, true) : new Map<string, number>()
    const st = stats(period).drivers
    const active = (n: string) => (st.get(n)?.races ?? 0) + (st.get(n)?.qualis ?? 0) > 0
    const ranked = [...endRanks]
      .filter(([n]) => active(n))
      .map(([name, rank]) => ({ name, elo: eloAt(name, end)!, rank, rankStart: startRanks.get(name) ?? null, races: st.get(name)?.races ?? 0, placing: false }))
      .sort((a, b) => a.rank - b.rank)
    // Fahrer in der Einstufung: dahinter, ohne Platz (nach gefahrenen Läufen)
    const placing = drivers
      .filter((n) => active(n) && !endRanks.has(n) && eloAt(n, end) != null)
      .sort((a, b) => (rating.history.get(b)?.length ?? 0) - (rating.history.get(a)?.length ?? 0) || a.localeCompare(b))
      .map((name, i) => ({ name, elo: eloAt(name, end)!, rank: ranked.length + i + 1, rankStart: null, races: st.get(name)?.races ?? 0, placing: true }))
    return [...ranked, ...placing]
  }

  // ---- Rekorde ---------------------------------------------------------------------------
  const trackRecords = new Map<string, RecordEntry>()
  const carRecords = new Map<string, RecordEntry>()
  const recordTimeline: { kind: 'track' | 'car'; key: string; entry: RecordEntry; prev: RecordEntry | null }[] = []
  const personalBest = new Map<string, number>()
  const pbEvents: { driver: string; date: string; prevExisted: boolean; ms: number; car: string }[] = []
  for (const s of sessions) {
    for (const r of s.results) {
      const valid = r.lapTimes.filter((l) => l.status !== 'invalid').map((l) => l.ms)
      if (!valid.length) continue
      const best = Math.min(...valid)
      const entry: RecordEntry = { ms: best, driver: r.driver, car: r.car, date: s.date, fileId: s.fileId, guest: isGuest(r.driver) }
      const tr = trackRecords.get(s.track)
      if (!tr || best < tr.ms) { recordTimeline.push({ kind: 'track', key: s.track, entry, prev: tr ?? null }); trackRecords.set(s.track, entry) }
      const ck = carKey(s.track, r.car)
      const cr = carRecords.get(ck)
      if (!cr || best < cr.ms) { recordTimeline.push({ kind: 'car', key: ck, entry, prev: cr ?? null }); carRecords.set(ck, entry) }
      if (!entry.guest) {
        const pk = `${s.track}\u0000${r.driver}`
        const pb = personalBest.get(pk)
        if (pb == null || best < pb) { pbEvents.push({ driver: r.driver, date: s.date, prevExisted: pb != null, ms: best, car: r.car }); personalBest.set(pk, best) }
      }
    }
  }

  // ---- 10/20 Runden ------------------------------------------------------------------------
  const splits = buildSplits(sessions)
  const splitTrack = (driver: string, upTo?: string) => splits.entries.findLast((e) => e.driver === driver && (!upTo || e.date <= upTo))?.track ?? null

  // ---- Status-Symbole --------------------------------------------------------------------
  const statusCache = new Map<Period, Map<string, Status[]>>()
  const statuses = (period: Period) => {
    const cached = statusCache.get(period)
    if (cached) return cached
    const out = new Map<string, Status[]>()
    const st = stats(period).drivers
    const rows = ranking(period)
    const inP = sessions.filter((s) => inPeriod(s.date, period))
    const lastDay = inP[inP.length - 1]?.date
    const daySessions = inP.filter((s) => s.date === lastDay)
    // Präzision des letzten Renntags
    let precise: string | null = null
    let preciseCv = Infinity
    for (const s of daySessions) for (const r of s.results) {
      if (isGuest(r.driver)) continue
      const c = cv(normalLaps(r))
      if (c != null && normalLaps(r).length >= 8 && c < preciseCv) { preciseCv = c; precise = r.driver }
    }
    for (const row of rows) {
      const d = st.get(row.name)
      const list: Status[] = []
      const hist = (rating.history.get(row.name) ?? []).filter((e) => e.date <= periodEnd(period))
      if (row.rank === 1 && !row.placing) list.push({ code: 'crown', label: 'Platz 1 der Wertung' })
      if (d && d.streak >= 2) list.push({ code: 'flame', value: d.streak, label: `${d.streak} Siege in Folge` })
      if (lastDay) {
        const tRec = recordTimeline.find((t) => t.kind === 'track' && t.entry.date === lastDay && t.entry.driver === row.name)
        const cRec = recordTimeline.find((t) => t.kind === 'car' && t.entry.date === lastDay && t.entry.driver === row.name && t.prev)
        const pb = pbEvents.find((p) => p.driver === row.name && p.date === lastDay && p.prevExisted)
        const recCount = recordTimeline.filter((t) => t.entry.date === lastDay && t.entry.driver === row.name && t.prev).length
        if (recCount >= 3) list.push({ code: 'hunter', label: `Rekordjäger: ${recCount} Rekorde am letzten Renntag` })
        else if (tRec) list.push({ code: 'record-track', label: 'Neuer Streckenrekord' })
        else if (cRec) list.push({ code: 'record-car', label: `Neuer Rekord mit ${cRec.entry.car}` })
        else if (pb) list.push({ code: 'record-personal', label: 'Neue persönliche Bestzeit' })
      }
      if (row.rankStart != null && row.rankStart > row.rank) list.push({ code: 'up', value: row.rankStart - row.rank, label: `${row.rankStart - row.rank} Plätze aufgestiegen` })
      const lastEvents = hist.filter((e) => e.date === lastDay)
      if (lastEvents.some((e) => e.upsetExpectation != null && e.upsetExpectation < 0.3)) list.push({ code: 'giant', label: 'Viel stärkeren Gegner geschlagen' })
      const lastRaces = d?.raceResults ?? []
      const dayRaces = lastRaces.filter((x) => x.session.date === lastDay)
      if (dayRaces.some(({ session, result }) => {
        const trace = positionTrace(session)
        const first = trace.get(result.driver + '#' + result.position)?.[0]
        return first != null && result.position <= 3 && first - result.position >= 2
      })) list.push({ code: 'comeback', label: 'Von hinten aufs Podium' })
      if (daySessions.some((s) => isQuali(s) && s.results[0]?.driver === row.name)) list.push({ code: 'pole', label: 'Schnellster im Qualifying' })
      if (precise === row.name) list.push({ code: 'precision', label: 'Konstantester Fahrer des Renntags' })
      const clean = lastRaces.filter((x) => !x.session.tank).slice(-3)
      if (clean.length === 3 && clean.every((x) => x.result.lapTimes.every((l) => l.status !== 'crash'))) list.push({ code: 'clean', label: '3 Rennen ohne Abflug' })
      const last3 = hist.slice(-3)
      if (last3.length === 3 && last3.every((e) => e.delta > 0)) list.push({ code: 'form', label: 'Wertung 3× in Folge gestiegen' })
      if ((rating.history.get(row.name)?.length ?? 0) < 5) list.push({ code: 'rookie', label: 'Rookie: unter 5 Läufen' })
      const last5 = lastRaces.slice(-5)
      if (last5.length === 5 && last5.every((x) => x.result.position > 3)) list.push({ code: 'ice', label: '5 Rennen ohne Podium' })
      out.set(row.name, list)
    }
    statusCache.set(period, out)
    return out
  }

  // ---- Saisonwertung ---------------------------------------------------------------------
  const inYear = (year: string) => sessions.filter((x) => x.date.startsWith(year))
  const seasonCache = new Map<string, SeasonStanding[]>()
  const season = (year: string): SeasonStanding[] => {
    if (!seasonCache.has(year)) seasonCache.set(year, seasonStandings(inYear(year)))
    return seasonCache.get(year)!
  }
  const constructors = (year: string) => constructorStandings(inYear(year))
  const challengeCache = new Map<string, Challenge[]>()
  const challenges = (driver: string, year: string): Challenge[] => {
    const key = `${driver}|${year}`
    if (!challengeCache.has(key)) {
      const st = season(year).find((r) => r.name === driver)
      const carsBefore = new Set(sessions.filter((x) => x.date < `${year}-01-01`).flatMap((x) => x.results.filter((r) => r.driver === driver).map((r) => r.car)))
      challengeCache.set(
        key,
        seasonChallenges(year, {
          sessions: inYear(year),
          driver,
          personalBests: pbEvents.filter((p) => p.driver === driver && p.prevExisted && p.date.startsWith(year)).map((p) => ({ car: p.car })),
          dayBonus: st ? st.poles + st.fastestLaps : 0,
          upsetWins: rating.events.filter((e) => e.driver === driver && e.date.startsWith(year) && e.position === 1 && e.upsetExpectation != null && e.upsetExpectation < 0.35).length,
          carsBefore,
          splits: (() => {
            const track = splitTrack(driver, `${year}-12-31`)
            if (!track) return []
            return SPLIT_LAPS.map((n) => {
              const pbBefore = splits.best(driver, track, n, `${year}-01-01`)
              const step = splits.step.get(splitKey(track, n))
              return {
                n, pbBefore,
                mark: pbBefore != null && step ? markReached(pbBefore, step) : null,
                times: splits.entries.filter((e) => e.driver === driver && e.track === track && e.n === n && e.date.startsWith(year)).map((e) => ({ ms: e.ms, prevBest: e.prevBest })),
              }
            })
          })(),
        }),
      )
    }
    return challengeCache.get(key)!
  }

  // ---- Karriere-Level ---------------------------------------------------------------------
  const careerCache = new Map<string, Career | null>()
  const career = (driver: string): Career | null => {
    if (careerCache.has(driver)) return careerCache.get(driver)!
    const d = stats('all').drivers.get(driver)
    if (!d) return null
    const days = new Set(sessions.filter((x) => x.results.some((r) => r.driver === driver)).map((x) => x.date)).size
    const pbs = pbEvents.filter((p) => p.driver === driver && p.prevExisted).length
    const km = Math.floor(d.km ?? 0)
    const done = years.reduce((n, y) => n + challenges(driver, y).filter((c) => c.done).length, 0)
    const breakdown = [
      { label: 'Rennen', count: d.races, xp: d.races * CAREER_XP.race },
      { label: 'Qualifyings', count: d.qualis, xp: d.qualis * CAREER_XP.quali },
      { label: 'Renntage', count: days, xp: days * CAREER_XP.raceDay },
      { label: 'Siege', count: d.wins, xp: d.wins * CAREER_XP.win },
      { label: 'Podien', count: d.podiums, xp: d.podiums * CAREER_XP.podium },
      { label: 'Kilometer', count: km, xp: km * CAREER_XP.km },
      { label: 'Neue Bestzeiten', count: pbs, xp: pbs * CAREER_XP.personalBest },
      { label: 'Saison-Challenges', count: done, xp: done * CHALLENGE_XP },
    ]
    const xp = breakdown.reduce((a, b) => a + b.xp, 0)
    let level = 1
    while (levelXp(level + 1) <= xp) level++
    const title = careerTitle(level)
    const result = { xp, level, title, levelXp: levelXp(level), nextXp: levelXp(level + 1), breakdown }
    careerCache.set(driver, result)
    return result
  }

  // ---- Medaillen -------------------------------------------------------------------------
  const medals = computeMedals(sessions, rating, stats('all').drivers, recordTimeline, years, rankingAt, dates, season, splits)

  // ---- Ziele, Rivale, Tipps --------------------------------------------------------------
  const rival = (driver: string) => {
    const d = stats('all').drivers.get(driver)
    if (!d) return null
    let best: { name: string; wins: number; losses: number; score: number } | null = null
    for (const [name, [w, l]] of d.h2h) {
      const n = w + l
      if (n < 2) continue
      const score = n * (1 - Math.abs(w / n - 0.5) * 2) + n * 0.1
      if (!best || score > best.score) best = { name, wins: w, losses: l, score }
    }
    return best ? { name: best.name, wins: best.wins, losses: best.losses } : null
  }

  const goals = (driver: string): Goal[] => {
    const d = stats('all').drivers.get(driver)
    if (!d) return []
    const out: Goal[] = []
    const rows = ranking('all')
    const me = rows.find((r) => r.name === driver)
    const above = me && !me.placing ? rows.find((r) => r.rank === me.rank - 1) : null
    if (me && above) {
      const gap = Math.ceil(above.elo - me.elo)
      out.push({ label: `${gap} Punkte bis Platz ${above.rank}`, detail: `vor ${above.name}`, progress: Math.max(0, Math.min(1, 1 - gap / 30)) })
    }
    // Nächste Zeitmarke über 10/20 Runden – die, die relativ am nächsten liegt
    const track = splitTrack(driver)
    const markGoal = track
      ? SPLIT_LAPS.map((n) => {
          const pb = splits.best(driver, track, n)
          const step = splits.step.get(splitKey(track, n))
          if (pb == null || !step) return null
          const mark = markNext(pb, step)
          return { n, pb, mark, gap: pb - mark, share: (pb - mark) / step }
        })
          .filter((x) => x != null)
          .sort((a, b) => a.share - b.share)[0]
      : undefined
    if (markGoal) {
      const s2 = (ms: number) => (ms / 1000).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      out.push({
        label: `${s2(markGoal.gap)} s bis ${markGoal.n} Runden unter ${fmtMark(markGoal.mark)}`,
        detail: `Bestmarke ${formatTime(markGoal.pb)} · ${s2(markGoal.gap / markGoal.n)} s pro Runde`,
        progress: Math.max(0, Math.min(1, 1 - markGoal.share)),
      })
    }
    const nextStep = (value: number, steps: number[]) => steps.find((s) => s > value)
    const w = nextStep(d.wins, WIN_STEPS)
    if (w) out.push({ label: `Noch ${w - d.wins} ${w - d.wins === 1 ? 'Sieg' : 'Siege'} bis „${w} Siege“`, detail: 'Medaille', progress: d.wins / w })
    if (d.favoriteCar) {
      for (const t of tracks) {
        const rec = carRecords.get(carKey(t, d.favoriteCar))
        const own = d.cars.get(d.favoriteCar)?.bestLapMs
        if (rec && own != null && rec.driver !== driver && own - rec.ms < 400) {
          out.push({ label: `${((own - rec.ms) / 1000).toLocaleString('de-DE', { minimumFractionDigits: 3 })} s bis zum Rekord`, detail: `${d.favoriteCar} (${rec.driver})`, progress: Math.max(0, 1 - (own - rec.ms) / 400) })
        }
      }
    }
    const o = nextStep(d.opponentsBeaten.size, OPP_STEPS)
    if (o) out.push({ label: `Noch ${o - d.opponentsBeaten.size} neue Gegner schlagen`, detail: `für „${o} Gegner geschlagen“`, progress: d.opponentsBeaten.size / o })
    return out.slice(0, 3)
  }

  const tips = (driver: string): Tip[] => {
    const all = stats('all').drivers
    const d = all.get(driver)
    if (!d) return []
    const out: Tip[] = []
    const regulars = [...all.values()].filter((x) => x.races >= 3)
    const s1 = (ms: number) => (ms / 1000).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    const pct = (v: number) => `${(v * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`
    const nl = (r: Result) => r.lapTimes.filter((l) => l.status === 'normal').map((l) => l.ms)

    // Fahrzeugwahl: Tempo und Ergebnisse je Auto
    // Tempo relativ zum Feld desselben Laufs – so stören Bahnzustand und Jahr nicht
    const relPace = new Map<string, number[]>()
    for (const { session, result } of d.raceResults) {
      const own = median(nl(result))
      const fieldMed = median(session.results.flatMap((r) => nl(r)))
      if (own != null && fieldMed && nl(result).length >= 5) relPace.set(result.car, [...(relPace.get(result.car) ?? []), own / fieldMed])
    }
    const typical = median(d.raceResults.flatMap(({ result }) => nl(result)))
    const carSpeed = [...relPace].filter(([, xs]) => xs.length >= 3).map(([n, xs]) => ({ n, v: mean(xs)! })).sort((a, b) => a.v - b.v)
    if (carSpeed.length >= 2 && typical) {
      const diff = (carSpeed[carSpeed.length - 1].v - carSpeed[0].v) * typical
      if (diff >= 200) out.push({ title: 'Fahrzeugwahl', text: `Mit dem ${carSpeed[0].n} bist du im Vergleich zum Feld etwa ${s1(diff)} s pro Runde schneller als mit dem ${carSpeed[carSpeed.length - 1].n}.` })
    }
    const carShare = new Map<string, number[]>()
    for (const { session, result } of d.raceResults) {
      const n = session.results.length
      if (n > 1) carShare.set(result.car, [...(carShare.get(result.car) ?? []), (n - result.position) / (n - 1)])
    }
    const shares = [...carShare].filter(([, xs]) => xs.length >= 3).map(([n, xs]) => ({ n, v: mean(xs)! })).sort((a, b) => b.v - a.v)
    if (shares.length >= 2 && shares[0].v - shares[shares.length - 1].v >= 0.25) {
      out.push({ title: 'Erfolgsauto', text: `Mit dem ${shares[0].n} schlägst du ${pct(shares[0].v)} deiner Gegner, mit dem ${shares[shares.length - 1].n} nur ${pct(shares[shares.length - 1].v)}.` })
    }

    // Abflüge
    const avgCrash = mean(regulars.map((x) => x.crashRate).filter((x): x is number => x != null))
    if (d.crashRate != null && avgCrash != null) {
      const n1 = (v: number) => v.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
      if (d.crashRate > avgCrash * 1.3) out.push({ title: 'Abflüge', text: `Du fliegst öfter ab als der Schnitt (${n1(d.crashRate)} statt ${n1(avgCrash)} pro 100 Runden). Konstanz bringt hier mehr als Tempo.` })
      else if (d.crashRate < avgCrash * 0.6) out.push({ title: 'Sauber unterwegs', good: true, text: `Du fliegst selten ab: ${n1(d.crashRate)} Abflüge pro 100 Runden, der Schnitt liegt bei ${n1(avgCrash)}.` })
    }

    // Konstanz
    const avgPrec = mean(regulars.map((x) => x.precision).filter((x): x is number => x != null))
    if (d.precision != null && avgPrec != null && d.races >= 3) {
      if (d.precision > avgPrec * 1.15) out.push({ title: 'Gleichmäßigkeit', text: `Deine sauberen Runden schwanken um ${pct(d.precision)}, der Schnitt liegt bei ${pct(avgPrec)}. Gleichmäßig fahren bringt oft mehr als Risiko.` })
      else if (d.precision < avgPrec * 0.85) out.push({ title: 'Präzise', good: true, text: `Deine Runden sind sehr gleichmäßig: ${pct(d.precision)} Schwankung, der Schnitt liegt bei ${pct(avgPrec)}.` })
    }

    // Ausdauer: zweite Rennhälfte
    const halves = d.raceResults
      .map(({ result }) => {
        const laps = nl(result)
        if (laps.length < 8) return null
        const h = Math.floor(laps.length / 2)
        return mean(laps.slice(h))! - mean(laps.slice(0, h))!
      })
      .filter((x): x is number => x != null)
    const fade = halves.length >= 3 ? mean(halves) : null
    if (fade != null && fade > 250) out.push({ title: 'Ausdauer', text: `In der zweiten Rennhälfte verlierst du im Schnitt ${s1(fade)} s pro Runde. Vielleicht am Anfang etwas weniger riskieren.` })
    else if (fade != null && fade < -250) out.push({ title: 'Steigerung', good: true, text: `Du wirst im Rennen schneller: In der zweiten Hälfte bist du im Schnitt ${s1(-fade)} s pro Runde flotter.` })

    // Start: erste Runde gegenüber der eigenen typischen Runde, verglichen mit dem Feld
    const startLoss = (r: Result) => {
      const first = r.lapTimes[0]
      const med = median(nl(r))
      return first && first.status !== 'invalid' && med != null && nl(r).length >= 5 ? first.ms - med : null
    }
    const mine = d.raceResults.map(({ result }) => startLoss(result)).filter((x): x is number => x != null)
    const field = sessions.filter((x) => !isQuali(x)).flatMap((x) => x.results.filter((r) => !isGuest(r.driver) && r.driver !== driver).map(startLoss)).filter((x): x is number => x != null)
    if (mine.length >= 3 && field.length >= 10) {
      const diff = median(mine)! - median(field)!
      if (diff > 500) out.push({ title: 'Start', text: `Deine Startrunde kostet dich im Schnitt ${s1(diff)} s mehr als die anderen. Ein ruhiger, sauberer Start lohnt sich.` })
      else if (diff < -500) out.push({ title: 'Starke Starts', good: true, text: `Deine Startrunde ist im Schnitt ${s1(-diff)} s besser als die der anderen.` })
    }

    // Boxenstopps (Rennen mit Tankfunktion)
    const pitLoss = (name: string | null) =>
      sessions
        .filter((x) => x.tank && !isQuali(x))
        .flatMap((x) => x.results.filter((r) => (name ? r.driver === name : r.driver !== driver && !isGuest(r.driver))))
        // nur reine Stopps; mit leerem Tank kommen nicht gezählte Runden dazu
        .flatMap((r) => r.lapTimes.filter((l) => l.status === 'pit' && l.lossMs != null && l.lossMs <= 10_000).map((l) => l.lossMs!))
    const myPits = pitLoss(driver)
    const fieldPits = pitLoss(null)
    if (myPits.length >= 3 && fieldPits.length >= 10) {
      const diff = median(myPits)! - median(fieldPits)!
      if (diff > 1000) out.push({ title: 'Boxenstopps', text: `Deine Boxenstopps kosten im Schnitt ${s1(diff)} s mehr als die der anderen. Hier lässt sich leicht Zeit gutmachen.` })
      else if (diff < -1000) out.push({ title: 'Schnelle Box', good: true, text: `Deine Boxenstopps sind im Schnitt ${s1(-diff)} s schneller als die der anderen.` })
    }

    // Rivale: Tempo-Unterschied in gemeinsamen Rennen
    const rv = rival(driver)
    if (rv && rv.losses > rv.wins) {
      const diffs = d.raceResults
        .map(({ session, result }) => {
          const o = session.results.find((r) => r.driver === rv.name)
          const a = median(nl(result))
          const b2 = o ? median(nl(o)) : null
          return a != null && b2 != null ? a - b2 : null
        })
        .filter((x): x is number => x != null)
      const diff = mean(diffs)
      if (diff != null && diff > 100) out.push({ title: 'Rivale', text: `Gegen ${rv.name} steht es ${rv.wins} : ${rv.losses}. In gemeinsamen Rennen ist ${rv.name} im Schnitt ${s1(diff)} s pro Runde schneller.` })
      else out.push({ title: 'Rivale', text: `Gegen ${rv.name} steht es ${rv.wins} : ${rv.losses} – vom Tempo her seid ihr gleichauf. Es entscheiden Fehler und Starts.` })
    }

    // Noch nie gefahren: schnelles Auto ausprobieren
    const carsAll = [...stats('all').cars.values()].filter((c) => c.races >= 10 && c.tempo != null).sort((a, b) => a.tempo! - b.tempo!)
    const untried = carsAll.find((c) => !d.cars.has(c.name))
    if (untried && carsAll.indexOf(untried) <= 2) out.push({ title: 'Ausprobieren', text: `Den ${untried.name} bist du noch nie gefahren – mit ihm fahren dieselben Fahrer im Schnitt mit die schnellsten Runden.` })

    // Fortschritt: dieses Jahr gegenüber dem Vorjahr (Hauptstrecke)
    const track = d.raceResults.length ? d.raceResults[d.raceResults.length - 1].session.track : null
    const yearLaps = (y: string) => d.raceResults.filter(({ session }) => session.track === track && session.date.startsWith(y)).flatMap(({ result }) => nl(result))
    const [y1, y0] = years
    if (y1 && y0) {
      const a = yearLaps(y1)
      const b2 = yearLaps(y0)
      if (a.length >= 30 && b2.length >= 30) {
        const diff = median(b2)! - median(a)!
        if (diff > 150) out.push({ title: 'Fortschritt', good: true, text: `${y1} bist du im Schnitt ${s1(diff)} s pro Runde schneller als ${y0}.` })
        else if (diff < -150) out.push({ title: 'Formkurve', text: `${y1} bist du im Schnitt ${s1(-diff)} s pro Runde langsamer als ${y0}. Ein Blick auf die Fahrzeugwahl lohnt sich.` })
      }
    }

    // Rekorde: Bahnrekord nur, wenn er in Reichweite ist – sonst erreichbare Fahrzeugrekorde
    if (track) {
      const sec = (ms: number) => (ms / 1000).toLocaleString('de-DE', { minimumFractionDigits: 3 })
      const ownByCar = new Map<string, number>()
      for (const x of sessions) {
        if (x.track !== track) continue
        for (const r of x.results) {
          if (r.driver !== driver || r.validBestLapMs == null) continue
          ownByCar.set(r.car, Math.min(ownByCar.get(r.car) ?? Infinity, r.validBestLapMs))
        }
      }
      const own = Math.min(...ownByCar.values())
      const rec = trackRecords.get(track)
      let trackTip = false
      if (rec && rec.driver === driver) {
        out.push({ title: 'Bahnrekord', good: true, text: `Du hältst den Bahnrekord mit ${formatTime(rec.ms)} – verteidige ihn!` })
        trackTip = true
      } else if (rec && isFinite(own) && own - rec.ms <= rec.ms * RECORD_REACH.track) {
        out.push({ title: 'Bahnrekord in Reichweite', text: `Bis zum Bahnrekord (${formatTime(rec.ms)}, ${rec.driver}${rec.guest ? ' als Gast' : ''}) fehlen dir nur ${sec(own - rec.ms)} s.` })
        trackTip = true
      }
      const carRecs = [...ownByCar]
        .map(([car, best]) => ({ car, best, rec: carRecords.get(carKey(track, car)) }))
        .filter((x): x is { car: string; best: number; rec: RecordEntry } => x.rec != null)
      // Fahrzeugrekord, der zugleich Bahnrekord ist, steckt schon im Tipp oben
      const sameAsTrack = (x: { rec: RecordEntry }) => trackTip && rec != null && x.rec.ms === rec.ms && x.rec.car === rec.car
      const reachable = carRecs
        .filter((x) => x.rec.driver !== driver && !sameAsTrack(x) && x.best - x.rec.ms <= x.rec.ms * RECORD_REACH.car)
        .sort((a, b) => (a.best - a.rec.ms) / a.rec.ms - (b.best - b.rec.ms) / b.rec.ms)
      for (const x of reachable.slice(0, trackTip ? 1 : 2)) {
        out.push({ title: 'Fahrzeugrekord in Reichweite', text: `Im ${x.car} fehlen dir ${sec(x.best - x.rec.ms)} s zum Rekord von ${x.rec.driver}${x.rec.guest ? ' (Gast)' : ''} (${formatTime(x.rec.ms)}).` })
      }
      const held = carRecs.filter((x) => x.rec.driver === driver && !sameAsTrack(x))
      if (held.length) {
        const more = held.length === 2 ? ' und in einem weiteren Auto' : held.length > 2 ? ` und in ${held.length - 1} weiteren Autos` : ''
        out.push({ title: 'Fahrzeugrekord', good: true, text: `Du hältst den Rekord im ${held[0].car}${more} – verteidige ${held.length > 1 ? 'sie' : 'ihn'}!` })
      }
    }

    // 10/20 Runden: nächste Zeitmarke, frische Bestmarke, Platz unter allen Fahrern
    const st = splitTrack(driver)
    if (st) {
      const s2 = (ms: number) => (ms / 1000).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      for (const n of SPLIT_LAPS) {
        const pb = splits.best(driver, st, n)
        const step = splits.step.get(splitKey(st, n))
        if (pb == null || !step) continue
        const mark = markNext(pb, step)
        const mine = splits.entries.filter((e) => e.driver === driver && e.track === st && e.n === n)
        const last = mine[mine.length - 1]
        const others = new Map<string, number>()
        for (const e of splits.entries) if (e.track === st && e.n === n) others.set(e.driver, Math.min(others.get(e.driver) ?? Infinity, e.ms))
        const rank = 1 + [...others.values()].filter((v) => v < pb).length
        if (last && last.prevBest != null && last.ms < last.prevBest && last.date === dates[dates.length - 1]) {
          out.push({ title: `Neue Bestmarke über ${n} Runden`, good: true, text: `Zuletzt ${formatTime(last.ms)} – ${s2(last.prevBest - last.ms)} s schneller als deine alte Bestmarke.` })
        } else if (rank <= 3 && others.size >= 4) {
          out.push({ title: `${n} Runden`, good: true, text: `Mit ${formatTime(pb)} über ${n} Runden bist du auf Platz ${rank} von ${others.size} Fahrern.` })
        }
        out.push({
          title: `Zeitmarke ${n} Runden`,
          text: `Deine Bestmarke über ${n} Runden: ${formatTime(pb)}. Bis „unter ${fmtMark(mark)}“ fehlen ${s2(pb - mark)} s – nur ${s2((pb - mark) / n)} s pro Runde.`,
        })
      }
    }

    // Verbesserungstipps zuerst, dann Lob
    return [...out.filter((t) => !t.good), ...out.filter((t) => t.good)]
  }

  let timelineCache: ReturnType<Model['rankTimeline']> | null = null
  const rankTimeline = () => {
    if (timelineCache) return timelineCache
    const ranks = new Map<string, (number | null)[]>(drivers.map((d) => [d, []]))
    for (const date of dates) {
      const at = rankingAt(date, true)
      for (const d of drivers) ranks.get(d)!.push(at.get(d) ?? null)
    }
    timelineCache = { dates, ranks }
    return timelineCache
  }

  const news = (): NewsItem[] => {
    const lastDay = dates[dates.length - 1]
    if (!lastDay) return []
    const out: NewsItem[] = []
    for (const t of recordTimeline) {
      if (t.entry.date !== lastDay || t.entry.guest || !t.prev) continue
      if (t.kind === 'track') out.push({ kind: 'record-track', driver: t.entry.driver, title: `${t.entry.driver}: neuer Bahnrekord`, detail: `${formatTime(t.entry.ms)} im ${t.entry.car} · vorher ${formatTime(t.prev.ms)}`, value: t.entry.ms })
      else out.push({ kind: 'record-car', driver: t.entry.driver, title: `${t.entry.driver}: Rekord mit dem ${t.entry.car}`, detail: `${formatTime(t.entry.ms)} · vorher ${formatTime(t.prev.ms)} (${t.prev.driver})`, value: t.entry.ms })
    }
    for (const [driver, list] of medals) {
      for (const m of list) {
        if (m.date !== lastDay || m.former || m.kind === 'debuet' || m.kind === 'fahrzeugrekord' || m.kind === 'bahnrekord') continue
        if (m.kind === 'siege' && m.id === 'siege-1') out.push({ kind: 'medal', driver, title: `${driver}: erster Sieg!`, detail: `${TIER_LABEL[m.tier]}-Medaille „${m.name}“`, medal: m })
        else if (STEP_KINDS.has(m.kind)) out.push({ kind: 'medal', driver, title: `${driver}: ${m.name}`, detail: `${TIER_LABEL[m.tier]}-Medaille`, medal: m })
      }
    }
    const prevDay = dates[dates.length - 2]
    if (prevDay) {
      const before = rankingAt(prevDay, true)
      const after = rankingAt(lastDay, true)
      const climbs = [...after]
        .filter(([n, r]) => before.has(n) && before.get(n)! - r >= 1 && r <= 10)
        .map(([n, r]) => ({ n, r, up: before.get(n)! - r, d: (eloAt(n, lastDay) ?? 0) - (eloAt(n, prevDay) ?? 0) }))
        .sort((a, b) => b.up - a.up || a.r - b.r)
        .slice(0, 3)
      for (const c of climbs) out.push({ kind: 'climb', driver: c.n, title: `${c.n} klettert auf Platz ${c.r}`, detail: `${c.d >= 0 ? '+' : '−'}${Math.abs(Math.round(c.d))} Elo an einem Renntag`, value: c.up })
    }
    const pbs = pbEvents.filter((p) => p.date === lastDay && p.prevExisted)
    const recordHolders = new Set(out.filter((o) => o.kind.startsWith('record')).map((o) => o.driver))
    const seenPb = new Set<string>()
    for (const p of pbs.reverse()) {
      if (recordHolders.has(p.driver) || seenPb.has(p.driver)) continue
      seenPb.add(p.driver)
      out.push({ kind: 'record-personal', driver: p.driver, title: `${p.driver}: persönliche Bestzeit`, detail: `${formatTime(p.ms)} im ${p.car}`, value: p.ms })
    }
    // 10/20 Runden: Rekorde, geknackte Zeitmarken und neue Bestmarken des letzten Renntags
    for (const t of splits.recordTimeline) {
      if (t.date !== lastDay || !t.prev) continue
      out.push({ kind: 'split-record', driver: t.driver, title: `${t.driver}: Rekord über ${t.n} Runden`, detail: `${formatTime(t.ms)} im ${t.car} · vorher ${formatTime(t.prev.ms)} (${t.prev.driver})`, value: t.ms })
    }
    const splitDone = new Set(out.filter((o) => o.kind === 'split-record').map((o) => o.driver + o.title))
    const bestOfDay = new Map<string, (typeof splits.entries)[number]>()
    for (const e of splits.entries) {
      if (e.date !== lastDay || e.prevBest == null || e.ms >= e.prevBest) continue
      const k = `${e.driver}\u0000${e.n}`
      if (!bestOfDay.has(k) || e.ms < bestOfDay.get(k)!.ms) bestOfDay.set(k, e)
    }
    for (const e of bestOfDay.values()) {
      if (splitDone.has(e.driver + `${e.driver}: Rekord über ${e.n} Runden`)) continue
      const step = splits.step.get(splitKey(e.track, e.n))!
      const newMark = markReached(e.ms, step) < markReached(e.prevBest!, step)
      out.push({
        kind: 'split', driver: e.driver,
        title: newMark ? `${e.driver}: ${e.n} Runden unter ${fmtMark(markReached(e.ms, step))}` : `${e.driver}: Bestmarke über ${e.n} Runden`,
        detail: `${formatTime(e.ms)} · vorher ${formatTime(e.prevBest)}`, value: e.ms,
      })
    }
    const order = { 'record-track': 0, medal: 1, 'record-car': 2, 'split-record': 3, climb: 4, 'record-personal': 5, split: 6 }
    return out.sort((a, b) => order[a.kind] - order[b.kind])
  }

  // ---- Fahrstil (Netzdiagramm) -------------------------------------------------------------
  const cleanLaps = (r: Result) => r.lapTimes.filter((l) => l.status === 'normal')
  /** Ø Zeitverlust der Startrunde gegenüber der eigenen typischen Runde */
  const startLoss = (d: DriverStats) => {
    const xs = d.raceResults
      .map(({ result }) => {
        const nl = cleanLaps(result).map((l) => l.ms)
        const first = result.lapTimes[0]
        return first && first.status !== 'invalid' && nl.length >= 5 ? first.ms - median(nl)! : null
      })
      .filter((x): x is number => x != null)
    return xs.length >= 2 ? mean(xs) : null
  }
  /** Ø Unterschied zweite gegen erste Rennhälfte (ms pro Runde, + = langsamer) */
  const fade = (d: DriverStats) => {
    const xs = d.raceResults
      .map(({ result }) => {
        const nl = cleanLaps(result).filter((l) => l.number > 1).map((l) => l.ms)
        if (nl.length < 8) return null
        const h = Math.floor(nl.length / 2)
        return mean(nl.slice(h))! - mean(nl.slice(0, h))!
      })
      .filter((x): x is number => x != null)
    return xs.length >= 2 ? mean(xs) : null
  }
  let radarBase: { metrics: { key: string; label: string; higher: boolean; value: (d: DriverStats) => number | null; text: (v: number) => string }[]; regulars: DriverStats[] } | null = null
  const driverRadar = (driver: string): RadarAxis[] => {
    const all = stats('all').drivers
    const d = all.get(driver)
    if (!d) return []
    const s1 = (ms: number) => (ms / 1000).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const sign = (ms: number) => `${ms >= 0 ? '+' : '−'}${s1(Math.abs(ms))} s`
    radarBase ??= {
      regulars: [...all.values()].filter((x) => x.races >= 5 && !isGuest(x.name)),
      metrics: [
        { key: 'tempo', label: 'Tempo', higher: false, value: (x) => x.paceGap, text: (v) => `Ø ${sign(v)} pro Runde zur typischen Bestzeit` },
        { key: 'konstanz', label: 'Konstanz', higher: false, value: (x) => x.precision, text: (v) => `Rundenzeiten streuen um ${(v * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 })} %` },
        { key: 'start', label: 'Start', higher: false, value: startLoss, text: (v) => `Startrunde Ø ${sign(v)} gegenüber der eigenen Normalrunde` },
        { key: 'ausdauer', label: 'Ausdauer', higher: false, value: fade, text: (v) => `zweite Rennhälfte Ø ${sign(v)} pro Runde` },
        { key: 'sauber', label: 'Sauberkeit', higher: false, value: (x) => x.crashRate, text: (v) => `${v.toLocaleString('de-DE', { maximumFractionDigits: 1 })} Abflüge pro 100 Runden` },
        { key: 'zweikampf', label: 'Zweikampf', higher: true, value: (x) => x.beatShare, text: (v) => `schlägt im Schnitt ${Math.round(v * 100)} % des Feldes` },
      ],
    }
    const { metrics, regulars } = radarBase
    return metrics.map((m) => {
      const v = m.value(d)
      const vals = regulars.map(m.value).filter((x): x is number => x != null)
      if (v == null || vals.length < 3) return { key: m.key, label: m.label, score: 0.5, text: 'zu wenig Daten' }
      const better = vals.filter((x) => (m.higher ? x < v : x > v)).length
      const ties = vals.filter((x) => x === v).length
      const p = (better + ties / 2) / vals.length
      return { key: m.key, label: m.label, score: Math.max(0.06, Math.min(1, p)), text: `${m.text(v)} – besser als ${Math.round(p * 100)} % der Stammfahrer` }
    })
  }

  // ---- Jahresrückblick -------------------------------------------------------------------
  const wrapped = (driver: string, year: string): Wrapped | null => {
    const d = stats(year).drivers.get(driver)
    if (!d || d.races + d.qualis === 0) return null
    const standings = season(year)
    const fav = d.favoriteCar ? d.cars.get(d.favoriteCar) : null
    let bestRace: Wrapped['bestRace'] = null
    for (const { session, result } of d.raceResults) {
      const beaten = session.results.filter((r) => r.position > result.position).length
      const better = !bestRace || result.position < bestRace.result.position || (result.position === bestRace.result.position && beaten > bestRace.beaten)
      if (better) bestRace = { session, result, beaten }
    }
    const h2h = [...d.h2h].filter(([n]) => !isGuest(n))
    const top = (i: 0 | 1) => h2h.filter(([, v]) => v[i] > 0).sort((a, b) => b[1][i] - a[1][i])[0]
    const victim = top(0)
    const nemesis = top(1)
    let bestLap: Wrapped['bestLap'] = null
    for (const x of inYear(year)) {
      for (const r of x.results) {
        if (r.driver !== driver || r.validBestLapMs == null) continue
        if (!bestLap || r.validBestLapMs < bestLap.ms) bestLap = { ms: r.validBestLapMs, car: r.car, date: x.date }
      }
    }
    const pbsYear = pbEvents.filter((p) => p.driver === driver && p.date.startsWith(year))
    const before = pbEvents.filter((p) => p.driver === driver && p.date < `${year}-01-01`).pop()
    const pbGain = before && pbsYear.length ? before.ms - pbsYear[pbsYear.length - 1].ms : null
    const datesBefore = dates.filter((dt) => dt < `${year}-01-01`)
    const yearDates = dates.filter((dt) => dt.startsWith(year))
    return {
      driver, year, races: d.races, qualis: d.qualis, days: new Set(inYear(year).filter((x) => x.results.some((r) => r.driver === driver)).map((x) => x.date)).size,
      laps: d.laps, km: d.km, wins: d.wins, podiums: d.podiums,
      season: standings.find((r) => r.name === driver) ?? null, seasonSize: standings.length,
      favoriteCar: d.favoriteCar && fav ? { name: d.favoriteCar, races: fav.races } : null,
      bestRace,
      victim: victim ? { name: victim[0], count: victim[1][0], wins: victim[1][0], losses: victim[1][1] } : null,
      nemesis: nemesis ? { name: nemesis[0], count: nemesis[1][1], wins: nemesis[1][0], losses: nemesis[1][1] } : null,
      bestLap, pbGain: pbGain != null && pbGain > 0 ? pbGain : null,
      eloStart: datesBefore.length ? eloAt(driver, datesBefore[datesBefore.length - 1]) : null,
      eloEnd: yearDates.length ? eloAt(driver, yearDates[yearDates.length - 1]) : null,
      crashes: d.crashes, crashRate: d.crashRate,
      medals: (medals.get(driver) ?? []).filter((m) => !m.former && m.date.startsWith(year) && !m.title),
      challenges: challenges(driver, year),
      perDay: yearDates
        .map((date) => {
          const mine = inYear(year).filter((x) => x.date === date).flatMap((x) => x.results.filter((r) => r.driver === driver).map((r) => ({ x, r })))
          const races = mine.filter(({ x }) => !isQuali(x))
          const laps = mine.map(({ r }) => r.validBestLapMs).filter((v): v is number => v != null)
          return {
            date,
            races: races.length,
            wins: races.filter(({ x, r }) => r.position === 1 && x.results.length > 1).length,
            bestLapMs: laps.length ? Math.min(...laps) : null,
            crashes: races.filter(({ x }) => !x.tank).reduce((n, { r }) => n + r.lapTimes.filter((l) => l.status === 'crash').length, 0),
          }
        })
        .filter((p) => p.races > 0 || p.bestLapMs != null),
      elo: (rating.history.get(driver) ?? []).filter((e) => e.date.startsWith(year)).map((e) => ({ date: e.date, value: e.after, label: `${e.type} · Platz ${e.position} von ${e.field}` })),
      cars: [...d.cars].map(([name, u]) => ({ name, races: u.races })).filter((c) => c.races > 0).sort((a, b) => b.races - a.races),
      bestDay: (() => {
        const st = standings.find((r) => r.name === driver)
        const best = st ? [...st.days].sort((a, b) => b.points - a.points)[0] : undefined
        if (!best) return null
        const wins = inYear(year).filter((x) => x.date === best.date && !isQuali(x) && x.results.length > 1 && x.results[0]?.driver === driver).length
        return { date: best.date, points: best.points, races: best.races, wins }
      })(),
      moment: (() => {
        const hist = rating.history.get(driver) ?? []
        const top = hist.filter((e, i) => i >= rating.placementRuns(driver) && e.date.startsWith(year) && e.delta > 0).sort((a, b) => b.delta - a.delta)[0]
        return top ? { date: top.date, delta: top.delta, reason: top.reason, fileId: top.fileId, position: top.position, field: top.field, type: top.type, car: top.car } : null
      })(),
      prev: (() => {
        const py = String(Number(year) - 1)
        const p = stats(py).drivers.get(driver)
        if (!p || p.races === 0) return null
        const laps = inYear(py).flatMap((x) => x.results.filter((r) => r.driver === driver && r.validBestLapMs != null).map((r) => r.validBestLapMs!))
        return { year: py, races: p.races, wins: p.wins, bestLapMs: laps.length ? Math.min(...laps) : null, rank: season(py).find((r) => r.name === driver)?.rank ?? null, km: p.km }
      })(),
      lapRank: (() => {
        if (!bestLap) return null
        const track = inYear(year).find((x) => x.date === bestLap!.date && x.results.some((r) => r.driver === driver && r.validBestLapMs === bestLap!.ms))?.track
        if (!track) return null
        const best = new Map<string, number>()
        for (const x of inYear(year)) {
          if (x.track !== track) continue
          for (const r of x.results) if (r.validBestLapMs != null && !isGuest(r.driver) && r.validBestLapMs < (best.get(r.driver) ?? Infinity)) best.set(r.driver, r.validBestLapMs)
        }
        const mine = best.get(driver)
        if (mine == null) return null
        return { rank: 1 + [...best.values()].filter((v) => v < mine).length, of: best.size, track }
      })(),
      radar: d.races >= 5 ? driverRadar(driver) : [],
      splits: (() => {
        const track = splitTrack(driver, `${year}-12-31`)
        if (!track) return []
        return SPLIT_LAPS.flatMap((n) => {
          const year_ = splits.entries.filter((e) => e.track === track && e.n === n && e.date.startsWith(year))
          const mine = year_.filter((e) => e.driver === driver)
          if (!mine.length) return []
          const top = mine.reduce((a, b) => (b.ms < a.ms ? b : a))
          const before = splits.best(driver, track, n, `${year}-01-01`)
          const step = splits.step.get(splitKey(track, n))!
          const marks: number[] = []
          for (let m = markReached(top.ms, step); before == null ? marks.length === 0 : m < markReached(before, step); m += step) marks.push(m)
          const others = new Map<string, number>()
          for (const e of year_) others.set(e.driver, Math.min(others.get(e.driver) ?? Infinity, e.ms))
          return [{ n, ms: top.ms, date: top.date, car: top.car, before, marks: marks.reverse(), rank: 1 + [...others.values()].filter((v) => v < top.ms).length, of: others.size }]
        })
      })(),
    }
  }

  // ---- Eigener Fortschritt -------------------------------------------------------------------
  const carTypical = new Map<string, number>()
  {
    const pools = new Map<string, number[]>()
    for (const x of sessions) for (const r of x.results) for (const l of r.lapTimes) if (l.status === 'normal') (pools.get(carKey(x.track, r.car)) ?? pools.set(carKey(x.track, r.car), []).get(carKey(x.track, r.car))!).push(l.ms)
    for (const [k, xs] of pools) if (xs.length >= 30) carTypical.set(k, quantile([...xs].sort((a, b) => a - b), 0.5))
  }
  const progress = (driver: string) => {
    const rel: number[] = []
    for (const x of sessions) {
      if (isQuali(x)) continue
      const r = x.results.find((y) => y.driver === driver)
      const ref = r && carTypical.get(carKey(x.track, r.car))
      const nl = r?.lapTimes.filter((l) => l.status === 'normal').map((l) => l.ms).sort((a, b) => a - b) ?? []
      if (ref && nl.length >= 5) rel.push(quantile(nl, 0.5) / ref)
    }
    const n = Math.min(5, Math.floor(rel.length / 2))
    if (n < 3) return null
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
    return { pct: (avg(rel.slice(0, n)) / avg(rel.slice(-n)) - 1) * 100, races: rel.length }
  }

  // ---- Einstufung ------------------------------------------------------------------------
  const placement = (driver: string, fileId?: string): number | null => {
    const h = rating.history.get(driver) ?? []
    const runs = rating.placementRuns(driver)
    if (fileId == null) return h.length < runs ? h.length : null
    const i = h.findIndex((e) => e.fileId === fileId)
    return i >= 0 && i < runs ? i + 1 : null
  }

  return {
    sessions, years, tracks, rating, drivers, stats, ranking, statuses, medals,
    trackRecords, carRecords, goals, rival, tips, eloAt, rankTimeline, news, season, constructors, challenges, wrapped, driverRadar, career, placement, placementRuns: rating.placementRuns, progress, splits, splitTrack,
  }
}

const TIER_LABEL: Record<Tier, string> = { bronze: 'Bronze', silver: 'Silber', gold: 'Gold', platinum: 'Platin', diamond: 'Diamant' }
const STEP_KINDS = new Set(['siege', 'rennen', 'km', 'gegner'])

export const WIN_STEPS = [1, 5, 10, 25, 50]
export const RACE_STEPS = [10, 25, 50, 100]
export const KM_STEPS = [1, 5, 10, 25]
export const OPP_STEPS = [5, 10, 15, 20, 25]

/** Platzierungen pro Runde aus den aufsummierten Rundenzeiten. Schlüssel: Fahrer#Platz */
export function positionTrace(s: Session): Map<string, number[]> {
  const maxLaps = Math.max(0, ...s.results.map((r) => r.lapTimes.length))
  const out = new Map<string, number[]>(s.results.map((r) => [r.driver + '#' + r.position, []]))
  for (let k = 1; k <= maxLaps; k++) {
    const order = s.results
      .map((r) => {
        const done = Math.min(k, r.lapTimes.length)
        return { key: r.driver + '#' + r.position, done, time: r.lapTimes.slice(0, done).reduce((a, l) => a + l.ms, 0), pos: r.position }
      })
      .sort((a, b) => b.done - a.done || a.time - b.time || a.pos - b.pos)
    order.forEach((o, i) => out.get(o.key)!.push(i + 1))
  }
  return out
}

export interface RaceEvent {
  lap: number
  driver: string
  text: string
  kind: 'overtake' | 'pit' | 'crash' | 'lead'
}

/** Überholmanöver, Führungswechsel, Boxenstopps und Abflüge eines Laufs. */
export function raceEvents(s: Session): RaceEvent[] {
  const trace = positionTrace(s)
  const events: RaceEvent[] = []
  const keys = [...trace.keys()]
  const name = (k: string) => k.split('#')[0]
  const laps = Math.max(0, ...[...trace.values()].map((v) => v.length))
  for (let i = 1; i < laps; i++) {
    for (const k of keys) {
      const prev = trace.get(k)![i - 1]
      const cur = trace.get(k)![i]
      if (cur < prev) {
        const passed = keys.find((o) => o !== k && trace.get(o)![i - 1] === cur)
        events.push({ lap: i + 1, driver: name(k), kind: cur === 1 ? 'lead' : 'overtake', text: cur === 1 ? `${name(k)} übernimmt die Führung${passed ? ` vor ${name(passed)}` : ''}` : `${name(k)} überholt ${passed ? name(passed) : ''} – P${cur}` })
      }
    }
  }
  for (const r of s.results) {
    r.lapTimes.forEach((l) => {
      if (l.status === 'pit') events.push({ lap: l.number, driver: r.driver, kind: 'pit', text: `${r.driver} an der Box (+${((l.lossMs ?? 0) / 1000).toFixed(1)} s)` })
      if (l.status === 'crash') events.push({ lap: l.number, driver: r.driver, kind: 'crash', text: `${r.driver}: Abflug (+${((l.lossMs ?? 0) / 1000).toFixed(1)} s)` })
    })
  }
  return events.sort((a, b) => a.lap - b.lap)
}

function computeMedals(
  sessions: Session[],
  rating: RatingResult,
  all: Map<string, DriverStats>,
  timeline: { kind: 'track' | 'car'; key: string; entry: RecordEntry; prev: RecordEntry | null }[],
  years: string[],
  rankingAt: (date: string) => Map<string, number>,
  dates: string[],
  season: (year: string) => SeasonStanding[],
  splits: Splits,
): Map<string, Medal[]> {
  const out = new Map<string, Medal[]>()
  const add = (driver: string, m: Medal) => {
    if (isGuest(driver)) return
    const list = out.get(driver) ?? []
    list.push(m)
    out.set(driver, list)
  }
  const drivers = [...all.values()].filter((d) => d.races + d.qualis > 0)
  const lastDate = sessions[sessions.length - 1]?.date ?? ''

  // Wanderpokale: Bahn- und Fahrzeugrekorde (nur Fahrer, keine Gäste)
  const holders = new Map<string, { driver: string; from: string }[]>()
  for (const t of timeline) {
    if (t.entry.guest) continue
    const list = holders.get(t.kind + t.key) ?? []
    if (list[list.length - 1]?.driver !== t.entry.driver) list.push({ driver: t.entry.driver, from: t.entry.date })
    holders.set(t.kind + t.key, list)
  }
  for (const [k, list] of holders) {
    const isTrack = k.startsWith('track')
    const [, car] = k.slice(isTrack ? 5 : 3).split('\u0000')
    const base = isTrack
      ? { kind: 'bahnrekord', name: 'Bahnrekord', description: 'Schnellste Runde auf der Strecke', tier: 'diamond' as Tier, icon: 'trophy' as const }
      : { kind: 'fahrzeugrekord', name: `Rekord ${car}`, description: `Schnellste Runde mit dem ${car}`, tier: 'gold' as Tier, icon: 'clock' as const }
    const current = list[list.length - 1]
    add(current.driver, { id: `${k}-now`, ...base, date: current.from })
    // Ehemalige Inhaber: je Fahrer nur die letzte Amtszeit
    const seen = new Set([current.driver])
    for (let i = list.length - 2; i >= 0; i--) {
      const h = list[i]
      if (seen.has(h.driver)) continue
      seen.add(h.driver)
      add(h.driver, { id: `${k}-${i}`, ...base, date: h.from, former: { from: h.from, to: list[i + 1].from } })
    }
  }

  // Titel mit genau einem Inhaber (aktueller Stand)
  const title = (kind: string, name: string, description: string, tier: Tier, icon: Medal['icon'], pick: (d: DriverStats) => number | null, higher = true) => {
    let best: number | null = null
    let who: string[] = []
    for (const d of drivers) {
      const v = pick(d)
      if (v == null) continue
      if (best == null || (higher ? v > best : v < best)) { best = v; who = [d.name] } else if (v === best) who.push(d.name)
    }
    for (const w of who) add(w, { id: kind, kind, name, description, tier, icon, date: lastDate, title: true })
  }
  title('rekordsieger', 'Rekordsieger', 'Die meisten Rennsiege', 'diamond', 'trophy', (d) => (d.wins > 0 ? d.wins : null))
  title('beste-platzierung', 'Beste Platzierung', 'Höchster Anteil geschlagener Gegner (ab 5 Rennen)', 'platinum', 'star', (d) => (d.races >= 5 ? d.beatShare : null))
  title('laengste-serie', 'Längste Siegesserie', 'Die meisten Siege in Folge', 'platinum', 'flame', (d) => (d.maxStreak >= 2 ? d.maxStreak : null))
  title('allrounder', 'Allrounder', 'Die meisten verschiedenen Autos gefahren', 'gold', 'car', (d) => (d.cars.size >= 3 ? d.cars.size : null))
  title('praezision', 'Präzisionsmeister', 'Die gleichmäßigsten Rundenzeiten (ab 5 Rennen)', 'gold', 'target', (d) => (d.races >= 5 ? d.precision : null), false)
  title('saubermann', 'Saubermann', 'Die wenigsten Abflüge pro 100 Runden', 'gold', 'shield', (d) => (d.crashBaseLaps >= 50 ? d.crashRate : null), false)
  title('kilometerfresser', 'Kilometerfresser', 'Die meisten gefahrenen Kilometer', 'gold', 'road', (d) => d.km)
  title('dauerbrenner', 'Dauerbrenner', 'An den meisten Renntagen dabei', 'gold', 'flag', (d) => (d.raceDays.size >= 2 ? d.raceDays.size : null))
  title('quali-ass', 'Qualifying-Ass', 'Die meisten Bestzeiten im Qualifying', 'gold', 'flag', (d) => (d.poles > 0 ? d.poles : null))

  // Giant Killer: die meisten Siege gegen klar stärkere Gegner
  const upsets = new Map<string, number>()
  for (const e of rating.events) if (e.upsetExpectation != null && e.upsetExpectation < 0.35) upsets.set(e.driver, (upsets.get(e.driver) ?? 0) + 1)
  const maxUpset = Math.max(0, ...upsets.values())
  for (const [d, n] of upsets) if (n === maxUpset && n > 0) add(d, { id: 'giant-killer', kind: 'giant-killer', name: 'Giant Killer', description: 'Am öftesten stärkere Fahrer und Autos geschlagen', tier: 'platinum', icon: 'sword', date: lastDate, title: true })

  // Jahresschnellster
  for (const y of years) {
    let best: { ms: number; driver: string; date: string } | null = null
    for (const s of sessions) if (s.date.startsWith(y)) for (const r of s.results) {
      if (isGuest(r.driver) || r.validBestLapMs == null) continue
      if (!best || r.validBestLapMs < best.ms) best = { ms: r.validBestLapMs, driver: r.driver, date: s.date }
    }
    if (best) add(best.driver, { id: `jahr-${y}`, kind: 'jahresschnellster', name: `Jahresschnellster ${y}`, description: 'Schnellste Runde des Jahres', tier: 'platinum', icon: 'clock', date: best.date })
  }

  // Saison-Awards (abgeschlossene Jahre)
  const thisYear = String(new Date().getFullYear())
  const firstSeen = new Map<string, string>()
  for (const s of sessions) for (const r of s.results) if (!firstSeen.has(r.driver)) firstSeen.set(r.driver, s.date)
  for (const y of years) {
    if (y >= thisYear) continue
    const lastInYear = dates.filter((dt) => dt.startsWith(y)).pop() ?? `${y}-12-31`
    const standings = season(y)
    // Saisonsieger: die meisten Punkte (mit Streichresultaten)
    for (const w of standings.filter((r) => r.rank === 1 && r.points > 0)) {
      add(w.name, { id: `saison-${y}`, kind: 'saisonsieger', name: `Saisonsieger ${y}`, description: `Saisonwertung gewonnen mit ${w.points} Punkten`, tier: 'platinum', icon: 'trophy', date: lastInYear })
    }
    // Rookie des Jahres: bester Neuling der Saison
    const rookies = standings.filter((r) => firstSeen.get(r.name)?.startsWith(y) && r.points > 0)
    if (rookies.length && rookies[0].rank > 1) {
      add(rookies[0].name, { id: `rookie-${y}`, kind: 'rookie-jahr', name: `Rookie ${y}`, description: `Bester Neuling der Saison (Platz ${rookies[0].rank}, ${rookies[0].points} Punkte)`, tier: 'gold', icon: 'star', date: lastInYear })
    }
    // Saubermann des Jahres: die wenigsten Abflüge pro 100 Runden (Rennen ohne Tank, ab 40 Runden)
    const crash = new Map<string, [number, number]>()
    for (const s of sessions) {
      if (!s.date.startsWith(y) || s.tank || /quali/i.test(s.type)) continue
      for (const r of s.results) {
        if (isGuest(r.driver)) continue
        const a = crash.get(r.driver) ?? [0, 0]
        crash.set(r.driver, [a[0] + r.lapTimes.filter((l) => l.status === 'crash').length, a[1] + r.laps])
      }
    }
    const clean = [...crash].filter(([, [, laps]]) => laps >= 40).map(([n, [c, laps]]) => ({ n, rate: (c / laps) * 100 })).sort((a, b) => a.rate - b.rate)
    if (clean.length >= 3) {
      for (const x of clean.filter((x) => x.rate === clean[0].rate)) {
        add(x.n, { id: `sauber-${y}`, kind: 'saubermann-jahr', name: `Saubermann ${y}`, description: `Die wenigsten Abflüge der Saison (${x.rate.toLocaleString('de-DE', { maximumFractionDigits: 1 })} pro 100 Runden)`, tier: 'gold', icon: 'shield', date: lastInYear })
      }
    }
    // Außenseiter des Jahres: die meisten Siege gegen klar stärkere Gegner
    const upsetWins = new Map<string, number>()
    for (const e of rating.events) if (e.date.startsWith(y) && e.position === 1 && e.upsetExpectation != null && e.upsetExpectation < 0.35) upsetWins.set(e.driver, (upsetWins.get(e.driver) ?? 0) + 1)
    const maxUp = Math.max(0, ...upsetWins.values())
    if (maxUp > 0) {
      for (const [n, c] of upsetWins) if (c === maxUp) add(n, { id: `aussenseiter-${y}`, kind: 'aussenseiter-jahr', name: `Außenseiter ${y}`, description: `Die meisten Siege als Außenseiter (${c})`, tier: 'gold', icon: 'sword', date: lastInYear })
    }
  }

  // Aufsteiger des Jahres: die meisten Plätze in der Wertung gewonnen (Stand vor dem Jahr → Jahresende)
  for (const y of years) {
    const before = dates.filter((dt) => dt < `${y}-01-01`)
    const inYear = dates.filter((dt) => dt.startsWith(y))
    if (!before.length || !inYear.length) continue
    const start = rankingAt(before[before.length - 1])
    const end = rankingAt(inYear[inYear.length - 1])
    const gains = [...end].filter(([n]) => start.has(n)).map(([n, r]) => ({ n, g: start.get(n)! - r }))
    const max = Math.max(0, ...gains.map((x) => x.g))
    if (max < 2) continue
    for (const x of gains.filter((x) => x.g === max)) {
      add(x.n, { id: `aufsteiger-${y}`, kind: 'aufsteiger', name: `Aufsteiger ${y}`, description: `Die meisten Plätze in der Wertung gewonnen (+${max})`, tier: 'gold', icon: 'chevrons', date: inYear[inYear.length - 1] })
    }
  }

  // 10/20 Runden: Rekordhalter und erreichte Zeitmarke je Strecke – erst ab SPLIT_REWARDS_FROM
  const rewarded = splits.entries.filter((e) => Number(e.date.slice(0, 4)) >= SPLIT_REWARDS_FROM)
  const multiTrack = new Set(rewarded.map((e) => e.track)).size > 1
  const recs = new Map<string, (typeof rewarded)[number]>()
  for (const e of rewarded) {
    const key = splitKey(e.track, e.n)
    if (!recs.has(key) || e.ms < recs.get(key)!.ms) recs.set(key, e)
  }
  for (const [key, rec] of recs) {
    const where = multiTrack ? ` (${rec.track})` : ''
    add(rec.driver, { id: `split-${key}-now`, kind: `rekord-${rec.n}`, name: `Rekord ${rec.n} Runden${where}`, description: `Schnellste Gesamtzeit über die ersten ${rec.n} Runden eines Rennens: ${formatTime(rec.ms)}`, tier: 'platinum', icon: 'trophy', date: rec.date })
  }
  const reached = new Map<string, { mark: number; date: string; key: string; e: (typeof rewarded)[number] }>()
  for (const e of rewarded) {
    const key = splitKey(e.track, e.n)
    const mark = markReached(e.ms, splits.step.get(key)!)
    const k = `${e.driver}\u0000${key}`
    if (!reached.has(k) || mark < reached.get(k)!.mark) reached.set(k, { mark, date: e.date, key, e })
  }
  for (const r of reached.values()) {
    // Stufe nach Abstand zum Rekord: je näher die Marke am Rekord, desto wertvoller
    const ratio = r.mark / recs.get(r.key)!.ms
    const tier: Tier = ratio <= 1.02 ? 'diamond' : ratio <= 1.05 ? 'platinum' : ratio <= 1.09 ? 'gold' : ratio <= 1.14 ? 'silver' : 'bronze'
    add(r.e.driver, {
      id: `marke-${r.key}`, kind: 'zeitmarke', name: `${r.e.n} Runden unter ${fmtMark(r.mark)}`,
      description: `Gesamtzeit der ersten ${r.e.n} Runden eines Rennens unter ${fmtMark(r.mark)}${multiTrack ? ` auf ${r.e.track}` : ''} (ohne Tankfunktion)`,
      tier, icon: 'clock', date: r.date,
    })
  }

  // Stufen: Siege, Rennen, Kilometer, geschlagene Gegner
  const steps: { kind: string; name: (n: number) => string; icon: Medal['icon']; levels: number[]; value: (d: DriverStats) => number }[] = [
    { kind: 'siege', name: (n) => (n === 1 ? 'Erster Sieg' : `${n} Siege`), icon: 'trophy', levels: WIN_STEPS, value: (d) => d.wins },
    { kind: 'rennen', name: (n) => `${n} Rennen`, icon: 'flag', levels: RACE_STEPS, value: (d) => d.races },
    { kind: 'km', name: (n) => `${n} km gefahren`, icon: 'track', levels: KM_STEPS, value: (d) => d.km ?? 0 },
    { kind: 'gegner', name: (n) => `${n} Gegner geschlagen`, icon: 'people', levels: OPP_STEPS, value: (d) => d.opponentsBeaten.size },
  ]
  // Pro Art zählt die höchste erreichte Stufe (die niedrigeren stehen in der Beschreibung)
  for (const st of steps) {
    for (const d of drivers) {
      const v = st.value(d)
      const idx = st.levels.reduce((best, level, i) => (v >= level ? i : best), -1)
      if (idx < 0) continue
      const level = st.levels[idx]
      add(d.name, {
        id: `${st.kind}-${level}`, kind: st.kind, name: st.name(level),
        description: idx > 0 ? `Stufe ${idx + 1} von ${st.levels.length} · vorher ${st.levels.slice(0, idx).join(', ')}` : `Stufe 1 von ${st.levels.length}`,
        tier: TIER_ORDER[Math.min(idx, 3)], icon: st.icon, date: reachedDate(d, st.kind, level),
      })
    }
  }
  // Jeder bekommt mindestens eine Medaille
  for (const d of drivers) {
    if ((out.get(d.name) ?? []).length === 0) {
      const first = rating.history.get(d.name)?.[0]?.date ?? lastDate
      add(d.name, { id: 'debuet', kind: 'debuet', name: 'Debüt', description: 'Erster Lauf bei GR Legends', tier: 'bronze', icon: 'star', date: first })
    }
  }
  for (const [k, list] of out) {
    list.sort((a, b) => Number(!!a.former) - Number(!!b.former) || TIER_ORDER.indexOf(b.tier) - TIER_ORDER.indexOf(a.tier) || b.date.localeCompare(a.date))
    out.set(k, list)
  }
  return out
}

/** Datum, an dem ein Fahrer eine Stufe erreicht hat. */
function reachedDate(d: DriverStats, kind: string, level: number): string {
  let wins = 0, races = 0, km = 0
  const beaten = new Set<string>()
  for (const { session, result } of d.raceResults) {
    races++
    if (result.position === 1) wins++
    if (session.trackLengthCm) km += (result.laps * session.trackLengthCm) / 100000
    for (const o of session.results) if (o !== result && !isGuest(o.driver) && result.position < o.position) beaten.add(o.driver)
    const v = kind === 'siege' ? wins : kind === 'rennen' ? races : kind === 'km' ? km : beaten.size
    if (v >= level) return session.date
  }
  return d.raceResults[d.raceResults.length - 1]?.session.date ?? ''
}

export type { RatingEvent }
