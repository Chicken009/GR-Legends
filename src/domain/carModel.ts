import type { Result, Session } from '../types'
import { isGuest } from './drivers'

/**
 * Autowertung aus den Runden: Wie schnell ist ein Auto, wenn man Fahrer und Lauf herausrechnet?
 *
 * Jedes Ergebnis liefert eine Beobachtung y (z. B. log der Ø Rundenzeit). Modell:
 *   y = Lauf + Fahrer + Auto
 * Der Lauf fängt Bahnzustand und Tagesform ab, der Fahrer sein Können. Übrig bleibt, was das Auto
 * ausmacht – gelernt vor allem aus Fahrern, die verschiedene Autos gefahren sind. Neuere Läufe
 * zählen stärker (Halbwertszeit), Autos mit wenig Daten werden Richtung Durchschnitt gezogen.
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

const daysBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86_400_000

export function fitCars(obs: CarObs[], asOf: string, halfLifeDays: number, prior: number, iterations = 40): CarFit {
  const rows = obs
    .filter((o) => o.date <= asOf)
    .map((o) => ({ ...o, w: o.w * 0.5 ** (Math.max(0, daysBetween(o.date, asOf)) / halfLifeDays) }))
  const S = new Map<string, number>()
  const D = new Map<string, number>()
  const C = new Map<string, number>()
  const weight = new Map<string, number>()
  for (const o of rows) weight.set(o.car, (weight.get(o.car) ?? 0) + o.w)
  const step = (key: (o: (typeof rows)[number]) => string, M: Map<string, number>, rest: (o: (typeof rows)[number]) => number, shrink: number) => {
    const acc = new Map<string, [number, number]>()
    for (const o of rows) {
      const a = acc.get(key(o)) ?? [0, 0]
      a[0] += o.w * (o.y - rest(o))
      a[1] += o.w
      acc.set(key(o), a)
    }
    for (const [k, [sum, w]] of acc) M.set(k, sum / (w + shrink))
  }
  for (let i = 0; i < iterations; i++) {
    step((o) => o.session, S, (o) => (D.get(o.driver) ?? 0) + (C.get(o.car) ?? 0), 0)
    step((o) => o.driver, D, (o) => (S.get(o.session) ?? 0) + (C.get(o.car) ?? 0), 0)
    step((o) => o.car, C, (o) => (S.get(o.session) ?? 0) + (D.get(o.driver) ?? 0), prior)
  }
  // Durchschnittliches Auto je Strecke = 0 (gewichtet nach Einsatz)
  const track = (key: string) => key.split('\u0000')[0]
  const mean = new Map<string, [number, number]>()
  for (const o of rows) {
    const t = track(o.car)
    const a = mean.get(t) ?? [0, 0]
    a[0] += o.w * (C.get(o.car) ?? 0)
    a[1] += o.w
    mean.set(t, a)
  }
  const effect = new Map<string, number>()
  for (const [k, v] of C) {
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

/** Was ein Abflug kostet, als Anteil einer sauberen Runde (Median je Strecke) */
export function crashCost(sessions: Session[]): Map<string, number> {
  const loss = new Map<string, number[]>()
  const laps = new Map<string, number[]>()
  for (const s of sessions) {
    for (const r of s.results) {
      for (const l of r.lapTimes) {
        if (l.status === 'crash' && l.lossMs != null) (loss.get(s.track) ?? loss.set(s.track, []).get(s.track)!).push(l.lossMs)
        if (l.status === 'normal') (laps.get(s.track) ?? laps.set(s.track, []).get(s.track)!).push(l.ms)
      }
    }
  }
  const out = new Map<string, number>()
  for (const [t, xs] of loss) {
    const ref = laps.get(t)
    if (xs.length >= 10 && ref?.length) out.set(t, median(xs) / median(ref))
  }
  return out
}

export interface CarEstimate {
  /** Tempo-Effekt (log, ≈ Anteil der Rundenzeit; minus = schneller) je carKey */
  pace: CarFit
  /** Abflüge pro Runde gegenüber dem Ø Auto je carKey */
  crash: CarFit
  /** Gesamteffekt: Tempo + Abflüge × Kosten eines Abflugs (≈ Anteil der Rundenzeit) */
  total: Map<string, number>
}

export function estimateCars(
  pace: CarObs[],
  crash: CarObs[],
  cost: Map<string, number>,
  asOf: string,
  halfLifeDays: number,
  prior: { pace: number; crash: number },
): CarEstimate {
  const p = fitCars(pace, asOf, halfLifeDays, prior.pace)
  // Abflüge streuen stark und hängen kaum am Auto – deshalb deutlich stärker zum Schnitt gezogen
  const c = fitCars(crash, asOf, halfLifeDays, prior.crash)
  const total = new Map<string, number>()
  for (const key of new Set([...p.effect.keys(), ...c.effect.keys()])) {
    const k = cost.get(key.split('\u0000')[0]) ?? 0
    total.set(key, (p.effect.get(key) ?? 0) + (c.effect.get(key) ?? 0) * k)
  }
  return { pace: p, crash: c, total }
}
