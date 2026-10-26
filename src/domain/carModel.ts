import type { Result, Session } from '../types'
import { isGuest } from './drivers'

/**
 * Autowertung aus den Runden: Wie schnell ist ein Auto, wenn man Fahrer und Lauf herausrechnet?
 *
 * Jedes Ergebnis liefert eine Beobachtung y (z. B. log der Ø Rundenzeit). Modell:
 *   y = Lauf + Fahrer + Auto
 * Der Lauf fängt Bahnzustand und Tagesform ab, der Fahrer sein Können. Übrig bleibt, was das Auto
 * ausmacht – gelernt vor allem aus Fahrern, die verschiedene Autos gefahren sind. Alle Läufe zählen,
 * gleichbleibende neue Entwicklungen zusätzlich als Trend. Autos mit wenig Daten werden Richtung
 * Durchschnitt gezogen.
 */
export interface CarObs {
  session: string
  date: string
  driver: string
  /** carKey(Strecke, Auto) */
  car: string
  y: number
  /** Gewicht (z. B. Qualifying halb) */
  w: number
}

export interface CarFit {
  /** Effekt je carKey, bezogen auf das durchschnittliche Auto der Strecke (0) */
  effect: Map<string, number>
  /** Effektive Zahl der Beobachtungen je carKey */
  weight: Map<string, number>
}

/** Gewichtung nach Konsistenz: wie stark eigene Streuung zählt und wie stark geglättet wird */
export interface Consistency {
  /** Glättung in Läufen: So viele „durchschnittliche“ Läufe werden jedem Fahrer dazugerechnet */
  prior: number
  min: number
  max: number
  rounds: number
}

const daysBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86_400_000

/**
 * Zwei Stufen:
 * 1. Grundwert aus allen Läufen, alle gleich gewichtet – alte Daten zählen weiter voll.
 * 2. Trend: Was das Auto in neueren Läufen (Halbwertszeit) anders macht als sein Grundwert.
 *    Der Trend wird stark zum Grundwert gezogen (`trendPrior`): Ein einzelner Ausreißer bewegt
 *    kaum etwas, erst eine über mehrere Rennen gleichbleibende Entwicklung setzt sich durch.
 */
export function fitCars(obs: CarObs[], asOf: string, halfLifeDays: number, prior: number, trendPrior: number, consistency?: Consistency, iterations = 40): CarFit {
  const raw = obs.filter((o) => o.date <= asOf)
  let rows = raw
  const S = new Map<string, number>()
  const D = new Map<string, number>()
  const C = new Map<string, number>()
  const step = (key: (o: CarObs) => string, M: Map<string, number>, rest: (o: CarObs) => number, shrink: number) => {
    const acc = new Map<string, [number, number]>()
    for (const o of rows) {
      const a = acc.get(key(o)) ?? [0, 0]
      a[0] += o.w * (o.y - rest(o))
      a[1] += o.w
      acc.set(key(o), a)
    }
    for (const [k, [sum, w]] of acc) M.set(k, sum / (w + shrink))
  }
  const fit = () => {
    for (let i = 0; i < iterations; i++) {
      step((o) => o.session, S, (o) => (D.get(o.driver) ?? 0) + (C.get(o.car) ?? 0), 0)
      step((o) => o.driver, D, (o) => (S.get(o.session) ?? 0) + (C.get(o.car) ?? 0), 0)
      step((o) => o.car, C, (o) => (S.get(o.session) ?? 0) + (D.get(o.driver) ?? 0), prior)
    }
  }
  const resid = (o: CarObs) => o.y - (S.get(o.session) ?? 0) - (D.get(o.driver) ?? 0) - (C.get(o.car) ?? 0)
  fit()
  if (consistency) {
    // Konsistente Fahrer zählen mehr: Gewicht = 1 / eigene Rest-Streuung (geglättet bei wenigen Läufen)
    for (let round = 0; round < consistency.rounds; round++) {
      const acc = new Map<string, [number, number]>()
      let pool = 0
      let poolN = 0
      for (const o of raw) {
        const r2 = resid(o) ** 2
        const a = acc.get(o.driver) ?? [0, 0]
        acc.set(o.driver, [a[0] + r2, a[1] + 1])
        pool += r2
        poolN++
      }
      const pooled = poolN ? pool / poolN : 0
      if (!pooled) break
      const factor = new Map([...acc].map(([d, [sum, n]]) => {
        const v = (sum + consistency.prior * pooled) / (n + consistency.prior)
        return [d, Math.max(consistency.min, Math.min(consistency.max, pooled / v))] as const
      }))
      rows = raw.map((o) => ({ ...o, w: o.w * (factor.get(o.driver) ?? 1) }))
      fit()
    }
  }
  const weight = new Map<string, number>()
  for (const o of rows) weight.set(o.car, (weight.get(o.car) ?? 0) + o.w)
  // Trend: Restabweichung der neueren Läufe, zeitlich gewichtet und stark geglättet
  const trend = new Map<string, [number, number]>()
  for (const o of rows) {
    const w = o.w * 0.5 ** (Math.max(0, daysBetween(o.date, asOf)) / halfLifeDays)
    const a = trend.get(o.car) ?? [0, 0]
    a[0] += w * resid(o)
    a[1] += w
    trend.set(o.car, a)
  }
  const total = new Map([...C].map(([k, v]) => {
    const [sum, w] = trend.get(k) ?? [0, 0]
    return [k, v + sum / (w + trendPrior)] as const
  }))
  // Durchschnittliches Auto je Strecke = 0 (gewichtet nach Einsatz)
  const track = (key: string) => key.split('\u0000')[0]
  const mean = new Map<string, [number, number]>()
  for (const o of rows) {
    const t = track(o.car)
    const a = mean.get(t) ?? [0, 0]
    a[0] += o.w * (total.get(o.car) ?? 0)
    a[1] += o.w
    mean.set(t, a)
  }
  const effect = new Map<string, number>()
  for (const [k, v] of total) {
    const [sum, w] = mean.get(track(k)) ?? [0, 1]
    effect.set(k, v - sum / w)
  }
  return { effect, weight }
}

const normal = (r: Result) => r.lapTimes.filter((l) => l.status === 'normal').map((l) => l.ms)
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

/** Beobachtungen für das saubere Tempo: log der Ø sauberen Runde (log, damit Strecken vergleichbar sind) */
export function paceObservations(sessions: Session[], carKey: (track: string, car: string) => string, isQuali: (s: Session) => boolean, qualiWeight: number): CarObs[] {
  const out: CarObs[] = []
  for (const s of sessions) {
    const quali = isQuali(s)
    for (const r of s.results) {
      const nl = normal(r)
      if (isGuest(r.driver) || nl.length < (quali ? 3 : 5)) continue
      out.push({ session: s.fileId, date: s.date, driver: r.driver, car: carKey(s.track, r.car), y: Math.log(median(nl)), w: quali ? qualiWeight : 1 })
    }
  }
  return out
}

/** Beobachtungen für Abflüge pro Runde (nur Rennen ohne Tankfunktion) */
export function crashObservations(sessions: Session[], carKey: (track: string, car: string) => string, isQuali: (s: Session) => boolean): CarObs[] {
  const out: CarObs[] = []
  for (const s of sessions) {
    if (isQuali(s) || s.tank) continue
    for (const r of s.results) {
      if (isGuest(r.driver) || r.laps < 5) continue
      const crashes = r.lapTimes.filter((l) => l.status === 'crash').length
      out.push({ session: s.fileId, date: s.date, driver: r.driver, car: carKey(s.track, r.car), y: crashes / r.laps, w: 1 })
    }
  }
  return out
}

/**
 * Beobachtungen für Zwischenfälle: verlorene Zeit durch Abflüge und Defekte (langsame Runden) als
 * Anteil der sauberen Fahrzeit – ein Auto, das minutenlang steht, kostet so viel mehr als ein kurzer
 * Abflug. Nur Rennen ohne Tankfunktion (dort sind langsame Runden meist Boxenstopps).
 */
export function lossObservations(sessions: Session[], carKey: (track: string, car: string) => string, isQuali: (s: Session) => boolean): CarObs[] {
  const out: CarObs[] = []
  for (const s of sessions) {
    if (isQuali(s) || s.tank) continue
    for (const r of s.results) {
      const nl = normal(r)
      if (isGuest(r.driver) || r.laps < 5 || nl.length < 3) continue
      const lost = r.lapTimes.filter((l) => l.status === 'crash').reduce((a, l) => a + (l.lossMs ?? 0), 0)
      out.push({ session: s.fileId, date: s.date, driver: r.driver, car: carKey(s.track, r.car), y: lost / (median(nl) * r.laps), w: 1 })
    }
  }
  return out
}

export interface CarEstimate {
  /** Tempo-Effekt (log, ≈ Anteil der Rundenzeit; minus = schneller) je carKey */
  pace: CarFit
  /** Zeitverlust durch Abflüge und Defekte (Anteil der Fahrzeit) gegenüber dem Ø Auto je carKey */
  loss: CarFit
  /** Gesamteffekt: Tempo + Zeitverlust (≈ Anteil der Rundenzeit) */
  total: Map<string, number>
}

export interface EstimateOptions {
  asOf: string
  halfLifeDays: number
  prior: { pace: number; loss: number }
  trendPrior: { pace: number; loss: number }
  /** Konsistente Fahrer zählen mehr (ihre Abweichungen sind eher echte Autounterschiede) */
  consistency: Consistency
}

export function estimateCars(pace: CarObs[], loss: CarObs[], opt: EstimateOptions): CarEstimate {
  const p = fitCars(pace, opt.asOf, opt.halfLifeDays, opt.prior.pace, opt.trendPrior.pace, opt.consistency)
  // Zwischenfälle streuen stark und hängen viel am Fahrer – deshalb stärker zum Schnitt gezogen
  const l = fitCars(loss, opt.asOf, opt.halfLifeDays, opt.prior.loss, opt.trendPrior.loss, opt.consistency)
  const total = new Map<string, number>()
  for (const key of new Set([...p.effect.keys(), ...l.effect.keys()])) total.set(key, (p.effect.get(key) ?? 0) + (l.effect.get(key) ?? 0))
  return { pace: p, loss: l, total }
}
