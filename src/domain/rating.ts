import type { Result, Session } from '../types'
import { isGuest } from './drivers'
import { crashCost, crashObservations, estimateCars, estimateCarsLegacy, lossObservations, paceObservations, type CarObs } from './carModel'
import { cleanReference, quantile } from './laps'

export const RATING = {
  /** Startwert für Fahrer – mit der halben Skala bleiben die Werte dreistellig */
  start: 500,
  /**
   * Punkteabstand für eine Siegchance von 10 : 1 (klassisches Elo: 400). Die halbe Skala ändert
   * weder Reihenfolge noch Siegchancen, nur liegen die Zahlen enger beieinander.
   */
  scale: 200,
  /** Bewegung pro Lauf (Summe über alle Duelle, normiert auf die Feldgröße) */
  k: 24,
  /** Höhere Bewegung in den ersten Läufen, damit sich neue Fahrer schnell einpendeln */
  kProvisional: 48,
  /**
   * Einstufung: so viele Läufe zählen doppelt. 8 sagen Ergebnisse besser voraus als 5 (abgeglichen an
   * allen Läufen) – für Fahrer, deren erstes Rennen ab `v2From` ist; wer vorher begann, behält 5.
   */
  provisionalRaces: 8,
  provisionalRacesLegacy: 5,
  /**
   * Ab diesem Tag gelten die neue Autowertung (Zeitverlust, Schätzung vor jedem Lauf) und die längere
   * Einstufung. Ältere Läufe werden weiter wie bisher gerechnet – nichts ändert sich rückwirkend.
   */
  v2From: '2026-10-26',
  /** Autowertung vor `v2From`: Abflüge × typische Kosten, Glättung und Rechenschritte wie bisher */
  legacyCar: { prior: { pace: 2, crash: 15 }, trendPrior: { pace: 4, crash: 30 }, rounds: 3, iterations: 40 },
  /** Rechenschritte je Schätzung der Autowertung (genauso genau wie 40, aber schnell genug für jeden Lauf) */
  carIterations: 20,
  /**
   * Autowertung aus den Runden (pro Strecke): fahrer- und laufbereinigtes Tempo plus Zeitverlust durch
   * Abflüge und Defekte, umgerechnet in Elo-Punkte. 1 % schnellere Runden ≈ so viele Punkte –
   * abgeleitet aus dem Zusammenhang von Tempo und Wertung bei den Fahrern.
   */
  carEloPerPct: 8,
  /**
   * Wie stark Autos mit wenig Daten zum Durchschnitt gezogen werden (in Läufen). Abgestimmt daran, wie
   * gut die Autowertung Rennen vorhersagt, die bei der Schätzung weggelassen wurden: Das Tempo braucht
   * etwa 10 Läufe für die halbe Wirkung, Zwischenfälle (viel Zufall und Fahrer) etwa 15.
   */
  carPrior: { pace: 10, loss: 15 },
  /**
   * Trend der Autowertung: Neuere Läufe können den Grundwert (aus allen Läufen) verschieben, aber
   * erst, wenn die Entwicklung über mehrere Rennen gleich bleibt – so viele Läufe braucht ein Trend
   * für die halbe Wirkung.
   */
  carTrendPrior: { pace: 20, loss: 30 },
  /**
   * Konsistente Fahrer zählen für die Autowertung mehr: Gewicht = 1 / eigene Rest-Streuung im Modell
   * (relativ zum Schnitt, zwischen `min` und `max`). Wer gleichmäßig fährt, bei dem sind
   * Abweichungen eher echte Autounterschiede. Bei wenigen Läufen wird zum Schnitt geglättet (`prior`).
   */
  carConsistency: { prior: 5, min: 0.25, max: 3, rounds: 1 },
  /**
   * Halbwertszeit (Tage) für den Trend der Autowertung: So zeigen sich mechanische Verbesserungen
   * oder Verschleiß, ohne dass alte Läufe verloren gehen.
   */
  carHalfLifeDays: 120,
  /**
   * Duell gegen die Bahn: Zusätzlich zu den Duellen gegeneinander fährt jeder gegen einen festen
   * Maßstab (Startwert) – gewonnen, wenn die eigene saubere Runde schneller ist als die typische
   * Runde des Autos auf der Strecke. Nur Bonus, nie Abzug. Werden alle schneller, steigen alle.
   * Gewicht relativ zu einem Lauf.
   */
  benchWeight: 0.3,
  /** Vorsprung zur typischen Runde → Duell-Ergebnis: S = 0.5 + 0.5·tanh(Vorsprung / Skala) */
  benchScaleRel: 0.05,
  /** Qualifyings zählen halb */
  qualiWeight: 0.5,
  /** Abstand → Duell-Ergebnis: S = 0.5 + 0.5·tanh(Vorsprung / Skala) */
  raceScaleLaps: 0.65,
  qualiScaleRel: 0.025,
}

export interface RatingEvent {
  fileId: string
  date: string
  type: string
  driver: string
  car: string
  position: number
  field: number
  before: number
  after: number
  delta: number
  /** Kurzer Grund für die Änderung, z. B. „Sieg vor Anton Berger – der Nr. 1“ */
  reason: string
  /** Größte Überraschung im Lauf: Erwartung gegen einen geschlagenen Gegner (0–1) */
  upsetExpectation: number | null
  /** Anteil aus dem Duell gegen die Bahn (in der Änderung enthalten) */
  bench: number
}

export interface RatingResult {
  drivers: Map<string, number>
  /** Autowertung je carKey, Stand nach allen Läufen (für Anzeige und künftige Läufe) */
  cars: Map<string, number>
  /** Autowertung nach der alten Rechnung, Stand vor `v2From` – für Wettkämpfe, die vorher begonnen haben */
  legacyCars: Map<string, number>
  /** Zahl der Einstufungsläufe eines Fahrers (8, wer vor `v2From` begann: 5) */
  placementRuns: (driver: string) => number
  /**
   * Autowertung, wie sie vor einem Lauf feststand (aus allen früheren Läufen). Festgeschrieben: neue
   * Läufe ändern sie nicht mehr. Für Läufe nach dem letzten gewerteten Lauf gilt der aktuelle Stand.
   */
  carsBefore: (s: { date: string; createdTime: string }) => Map<string, number>
  /** Verlauf pro Fahrer (chronologisch) */
  history: Map<string, RatingEvent[]>
  /** Verlauf aller Läufe, für Rangverläufe */
  events: RatingEvent[]
}

export const carKey = (track: string, car: string) => `${track}\u0000${car}`

/** Autowertung aus einer Tabelle; neu auf dieser Strecke: Schnitt desselben Autos auf anderen Strecken */
export function carValue(cars: Map<string, number>, track: string, car: string): number {
  const own = cars.get(carKey(track, car))
  if (own != null) return own
  const others = [...cars].filter(([k]) => k.endsWith(`\u0000${car}`)).map(([, v]) => v)
  return others.length ? others.reduce((a, b) => a + b, 0) / others.length : 0
}


export function isQuali(s: Session) {
  return /quali/i.test(s.type)
}

/** Chronologische Reihenfolge: Datum, dann Upload-Zeit. */
export function sortSessions(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => a.date.localeCompare(b.date) || a.createdTime.localeCompare(b.createdTime))
}

const total = (r: Result) => r.lapTimes.reduce((sum, l) => sum + l.ms, 0)

/** Vorsprung von a gegenüber b in „Runden“ (Rennen) bzw. relativ zur Bestzeit (Qualifying). */
function margin(a: Result, b: Result, quali: boolean, ref: number): number {
  let m: number
  if (quali) {
    m = a.validBestLapMs != null && b.validBestLapMs != null ? (b.validBestLapMs - a.validBestLapMs) / ref : 0
  } else if (a.laps !== b.laps) {
    m = a.laps - b.laps
  } else {
    m = (total(b) - total(a)) / ref
  }
  // Die Platzierung laut Smartrace hat immer Vorrang
  const ahead = a.position < b.position
  if (ahead && m <= 0) m = 0.03
  if (!ahead && m >= 0) m = -0.03
  return m
}

function gapText(a: Result, b: Result): string {
  if (a.laps !== b.laps) {
    const n = Math.abs(a.laps - b.laps)
    return n === 1 ? 'eine Runde' : n === 2 ? 'zwei Runden' : `${n} Runden`
  }
  const s = Math.abs(total(a) - total(b)) / 1000
  return `${s.toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} s`
}

function rankOf(ratings: Map<string, number>, name: string): number {
  const own = ratings.get(name) ?? 0
  let rank = 1
  for (const [n, v] of ratings) if (n !== name && v > own) rank++
  return rank
}

/**
 * Elo aus direkten Duellen: Jeder Lauf wird in Duelle zerlegt. Die Stärke im Duell ist
 * Fahrerwertung + Autowertung (pro Strecke); das Ergebnis hängt vom Abstand ab. Gäste
 * werden ignoriert. Wer ein schwächeres Auto fährt, hat eine geringere Erwartung und
 * bekommt für einen Sieg entsprechend mehr Punkte.
 */
export function computeRatings(sessions: Session[], cfg = RATING): RatingResult {
  const drivers = new Map<string, number>()
  const cars = new Map<string, number>()
  const counts = new Map<string, number>()
  const history = new Map<string, RatingEvent[]>()
  const events: RatingEvent[] = []

  // Autowertung: immer nur aus früheren Läufen geschätzt (nie aus dem Ergebnis selbst)
  const ordered = sortSessions(sessions)
  const order = new Map(ordered.map((s, i) => [s.fileId, i]))
  const paceObs = paceObservations(sessions, carKey, isQuali, cfg.qualiWeight)
  const lossObs = lossObservations(sessions, carKey, isQuali)
  // Bis v2From die alte Rechnung (Abflüge × Kosten aus den Läufen vor v2From), danach die neue
  const v2 = ordered.findIndex((x) => x.date >= cfg.v2From)
  const legacyEnd = v2 < 0 ? ordered.length : v2
  const crashObs = crashObservations(ordered.slice(0, legacyEnd), carKey, isQuali)
  const cost = crashCost(ordered.slice(0, legacyEnd))
  const fit = (asOf: string, upTo: number) => {
    const before = (o: CarObs) => (order.get(o.session) ?? Infinity) < upTo
    const opt = { asOf, halfLifeDays: cfg.carHalfLifeDays }
    const total = asOf < cfg.v2From
      ? estimateCarsLegacy(paceObs.filter(before), crashObs.filter(before), cost, {
        ...opt, prior: cfg.legacyCar.prior, trendPrior: cfg.legacyCar.trendPrior, consistency: { ...cfg.carConsistency, rounds: cfg.legacyCar.rounds }, iterations: cfg.legacyCar.iterations,
      })
      : estimateCars(paceObs.filter(before), lossObs.filter(before), { ...opt, prior: cfg.carPrior, trendPrior: cfg.carTrendPrior, consistency: cfg.carConsistency, iterations: cfg.carIterations }).total
    return new Map([...total].map(([k, e]) => [k, -e * 100 * cfg.carEloPerPct]))
  }
  // Einstufung: Wer vor v2From begonnen hat, behält die alte Länge
  const firstDate = new Map<string, string>()
  const placementRuns = (driver: string) => ((firstDate.get(driver) ?? cfg.v2From) < cfg.v2From ? cfg.provisionalRacesLegacy : cfg.provisionalRaces)
  const carRating = (track: string, car: string) => carValue(cars, track, car)

  // Typische saubere Runde je Auto und Strecke (Maßstab für das Duell gegen die Bahn): für Läufe vor
  // v2From aus allen Läufen vor v2From, danach aus allen Läufen bis einschließlich des aktuellen –
  // spätere Läufe ändern ihn so nicht mehr
  const lapPools = new Map<string, number[]>()
  const addLaps = (s: Session) => {
    for (const r of s.results) {
      const nl = r.lapTimes.filter((l) => l.status === 'normal').map((l) => l.ms)
      for (const key of [carKey(s.track, r.car), s.track]) lapPools.set(key, [...(lapPools.get(key) ?? []), ...nl])
    }
  }
  for (const s of ordered.slice(0, legacyEnd)) addLaps(s)
  const typicalCache = new Map<string, number | null>()
  const typical = (key: string) => {
    if (!typicalCache.has(key)) {
      const xs = lapPools.get(key) ?? []
      typicalCache.set(key, xs.length >= 30 ? quantile([...xs].sort((a, b) => a - b), 0.5) : null)
    }
    return typicalCache.get(key)!
  }
  const benchRef = (track: string, car: string) => typical(carKey(track, car)) ?? typical(track)

  let fittedFor = ''
  let fittedAt = -1
  const hasObs = new Set([...paceObs, ...lossObs].map((o) => order.get(o.session)))
  for (const [i, s] of ordered.entries()) {
    // Für die Elo: bis v2From vor jedem Renntag aus allen früheren Tagen, danach vor jedem Lauf
    // (so ist ein neues Auto schon am ersten Abend eingeschätzt) – neu nur, wenn Runden dazukamen
    const perRun = s.date >= cfg.v2From && s.date === fittedFor && [...Array(i - fittedAt).keys()].some((k) => hasObs.has(fittedAt + k))
    if (s.date !== fittedFor || perRun) {
      cars.clear()
      for (const [k, v] of fit(s.date, i)) cars.set(k, v)
      fittedFor = s.date
      fittedAt = i
    }
    if (i >= legacyEnd) {
      addLaps(s)
      typicalCache.clear()
    }
    const players = s.results.filter((r) => !isGuest(r.driver))
    if (players.length < 2) continue
    for (const p of players) if (!firstDate.has(p.driver)) firstDate.set(p.driver, s.date)
    const quali = isQuali(s)
    const w = quali ? cfg.qualiWeight : 1
    const ref = cleanReference(s.results.flatMap((r) => r.lapTimes.filter((l) => l.status !== 'invalid').map((l) => l.ms))) ?? 10000
    const scale = quali ? cfg.qualiScaleRel : cfg.raceScaleLaps
    const strength = (r: Result) => (drivers.get(r.driver) ?? cfg.start) + carRating(s.track, r.car)

    const dDriver = new Map<string, number>()
    const details = new Map<string, { opp: Result; diff: number; e: number; s: number }[]>()
    for (const a of players) {
      for (const b of players) {
        if (a === b) continue
        const S = 0.5 + 0.5 * Math.tanh(margin(a, b, quali, ref) / scale)
        const E = 1 / (1 + 10 ** ((strength(b) - strength(a)) / cfg.scale))
        const diff = (S - E) / (players.length - 1)
        dDriver.set(a.driver, (dDriver.get(a.driver) ?? 0) + diff)
        const list = details.get(a.driver) ?? []
        list.push({ opp: b, diff, e: E, s: S })
        details.set(a.driver, list)
      }
    }

    const snapshot = new Map(drivers)
    for (const a of players) {
      const n = counts.get(a.driver) ?? 0
      const k = (n < placementRuns(a.driver) ? cfg.kProvisional : cfg.k) * w
      const before = drivers.get(a.driver) ?? cfg.start
      // Duell gegen die Bahn: eigene typische saubere Runde gegen die typische Runde des Autos
      const own = a.lapTimes.filter((l) => l.status === 'normal').map((l) => l.ms).sort((x, y) => x - y)
      const bRef = benchRef(s.track, a.car)
      let bench = 0
      if (bRef && own.length >= 3) {
        const Sb = 0.5 + 0.5 * Math.tanh((bRef - quantile(own, 0.5)) / bRef / cfg.benchScaleRel)
        const Eb = 1 / (1 + 10 ** ((cfg.start - before) / cfg.scale))
        // nur als Bonus: wer langsamer als der Maßstab ist, verliert nichts
        bench = Math.max(0, k * cfg.benchWeight * (Sb - Eb))
      }
      const after = before + k * (dDriver.get(a.driver) ?? 0) + bench
      drivers.set(a.driver, after)
      counts.set(a.driver, n + 1)

      const list = details.get(a.driver) ?? []
      const up = after >= before
      const key = list.reduce((best, d) => ((up ? d.diff > best.diff : d.diff < best.diff) ? d : best), list[0])
      const beaten = list.filter((d) => d.s > 0.5)
      const upsetExpectation = beaten.length ? Math.min(...beaten.map((d) => d.e)) : null
      const field = players.length
      let reason: string
      if (!key) reason = ''
      else if (up) {
        // „Nr. 1“ erst, wenn die Wertung des Gegners eingependelt ist
        const settled = (counts.get(key.opp.driver) ?? 0) >= placementRuns(key.opp.driver)
        const oppRank = settled && snapshot.has(key.opp.driver) ? rankOf(snapshot, key.opp.driver) : null
        const who = oppRank === 1 ? `${key.opp.driver}, der Nr. 1 der Wertung` : key.opp.driver
        const head = a.position === 1 ? `Sieg vor ${who}` : `Platz ${a.position} von ${field}, vor ${who}`
        reason = key.e < 0.35 ? `${head} – als Außenseiter` : head
      } else {
        reason = `Platz ${a.position} von ${field}, ${gapText(a, key.opp)} hinter ${key.opp.driver}`
      }
      reason += ` · ${a.car}`
      if (Math.round(bench) !== 0) reason += ` · Duell gegen die Bahn ${bench > 0 ? '+' : '−'}${Math.abs(Math.round(bench))}`
      const ev: RatingEvent = {
        fileId: s.fileId, date: s.date, type: s.type, driver: a.driver, car: a.car,
        position: a.position, field, before, after, delta: after - before, reason, upsetExpectation, bench,
      }
      events.push(ev)
      const h = history.get(a.driver) ?? []
      h.push(ev)
      history.set(a.driver, h)
    }
  }
  // Aktueller Stand: aus allen Läufen (neue Rechnung); alter Stand vor v2From für ältere Wettkämpfe
  const last = ordered[ordered.length - 1]
  cars.clear()
  if (last) for (const [k, v] of fit(last.date < cfg.v2From ? cfg.v2From : last.date, ordered.length)) cars.set(k, v)
  const latest = new Map(cars)
  const lastLegacy = ordered[legacyEnd - 1]
  const legacyCars = lastLegacy ? fit(lastLegacy.date, legacyEnd) : new Map<string, number>()
  // Stand vor einem Lauf: erst bei Bedarf geschätzt (Wettkämpfe), dann zwischengespeichert
  const snapshots = new Map<number, Map<string, number>>()
  const carsBefore = (x: { date: string; createdTime: string }) => {
    const i = ordered.findIndex((p) => p.date > x.date || (p.date === x.date && p.createdTime >= x.createdTime))
    if (i < 0) return latest
    return snapshots.get(i) ?? snapshots.set(i, fit(ordered[i].date, i)).get(i)!
  }
  return { drivers, cars, legacyCars, placementRuns, carsBefore, history, events }
}

/**
 * Hypothetische Elo-Änderung für A in einem Rennen zu zweit gegen B.
 * `margin` in Runden (positiv = A vorne), `runs` = bisherige Läufe von A (Einpendel-Phase).
 */
export function duelDelta(strengthA: number, strengthB: number, margin: number, runs: number, cfg = RATING): number {
  const k = runs < cfg.provisionalRaces ? cfg.kProvisional : cfg.k
  const S = 0.5 + 0.5 * Math.tanh(margin / cfg.raceScaleLaps)
  const E = 1 / (1 + 10 ** ((strengthB - strengthA) / cfg.scale))
  return k * (S - E)
}

/** Siegchance jedes Fahrers in einem Rennen untereinander (Bradley-Terry aus der Wertung). */
export function winChances(ratings: { name: string; strength: number }[], scale = RATING.scale): Map<string, number> {
  const weights = ratings.map((r) => 10 ** (r.strength / scale))
  const sum = weights.reduce((a, b) => a + b, 0)
  return new Map(ratings.map((r, i) => [r.name, weights[i] / sum]))
}
