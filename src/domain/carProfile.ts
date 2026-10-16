import type { Result, Session } from '../types'
import { isGuest } from './drivers'
import { quantile } from './laps'

/**
 * Eigenschaften eines Autos für das Netzdiagramm – jeweils fahrerbereinigt: Verglichen wird, wie
 * sich dieselben Fahrer mit diesem Auto gegenüber ihrem eigenen Schnitt (über alle Autos) schlagen.
 */
export interface CarTraits {
  /** Anteil sauberer Runden schneller als die eigenen besten 10 % (über alle Autos, je Strecke) */
  peakShare: number
  /** … gegenüber dem üblichen Anteil derselben Fahrer (Prozentpunkte als Anteil, + = öfter) */
  peakRel: number
  /** Streuung der sauberen Runden im Verhältnis zur üblichen Streuung der Fahrer (1 = wie immer) */
  spreadRatio: number
  /** Wie viel langsamer die Runden im Rennverlauf werden (ms pro Runde), gegenüber dem Üblichen */
  wearRel: number
  /** Ergebnisse, auf denen die Werte beruhen */
  results: number
}

/** „Spitzenrunde“: schneller als dieses Quantil der eigenen sauberen Runden auf der Strecke */
export const PEAK_QUANTILE = 0.1

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const normal = (r: Result) => r.lapTimes.filter((l) => l.status === 'normal' && l.number > 1)

/** Steigung der Rundenzeiten über die Runden (ms pro Runde), robust genug ab 5 Runden */
function slope(laps: { number: number; ms: number }[]): number | null {
  if (laps.length < 5) return null
  const mx = mean(laps.map((l) => l.number))!
  const my = mean(laps.map((l) => l.ms))!
  let sxy = 0
  let sxx = 0
  for (const l of laps) {
    sxy += (l.number - mx) * (l.ms - my)
    sxx += (l.number - mx) ** 2
  }
  return sxx ? sxy / sxx : null
}

export function carTraits(sessions: Session[], isQuali: (s: Session) => boolean): Map<string, CarTraits> {
  // Schwelle für eigene Spitzenrunden je Fahrer und Strecke (über alle Autos)
  const pool = new Map<string, number[]>()
  for (const s of sessions) {
    if (isQuali(s)) continue
    for (const r of s.results) {
      if (isGuest(r.driver)) continue
      const key = `${s.track}|${r.driver}`
      pool.set(key, [...(pool.get(key) ?? []), ...normal(r).map((l) => l.ms)])
    }
  }
  const pb = new Map([...pool].filter(([, xs]) => xs.length >= 20).map(([k, xs]) => [k, quantile([...xs].sort((a, b) => a - b), PEAK_QUANTILE)]))
  type Row = { driver: string; car: string; peak: number; spread: number | null; wear: number | null }
  const rows: Row[] = []
  for (const s of sessions) {
    if (isQuali(s)) continue
    for (const r of s.results) {
      if (isGuest(r.driver)) continue
      const laps = normal(r)
      const best = pb.get(`${s.track}|${r.driver}`)
      if (laps.length < 5 || !best) continue
      const ms = laps.map((l) => l.ms)
      const m = mean(ms)!
      const sd = Math.sqrt(mean(ms.map((x) => (x - m) ** 2))!)
      rows.push({
        driver: r.driver,
        car: r.car,
        peak: ms.filter((x) => x < best).length / ms.length,
        spread: m ? sd / m : null,
        wear: slope(laps),
      })
    }
  }
  // üblicher Wert je Fahrer über alle Autos
  const byDriver = (pick: (r: Row) => number | null) => {
    const acc = new Map<string, number[]>()
    for (const r of rows) {
      const v = pick(r)
      if (v != null) acc.set(r.driver, [...(acc.get(r.driver) ?? []), v])
    }
    return new Map([...acc].map(([d, xs]) => [d, mean(xs)!]))
  }
  const dPeak = byDriver((r) => r.peak)
  const dSpread = byDriver((r) => r.spread)
  const dWear = byDriver((r) => r.wear)
  const out = new Map<string, CarTraits>()
  const cars = new Set(rows.map((r) => r.car))
  for (const car of cars) {
    const list = rows.filter((r) => r.car === car)
    const ratios = list.filter((r) => r.spread != null && dSpread.get(r.driver)).map((r) => r.spread! / dSpread.get(r.driver)!)
    const wears = list.filter((r) => r.wear != null && dWear.has(r.driver)).map((r) => r.wear! - dWear.get(r.driver)!)
    out.set(car, {
      peakShare: mean(list.map((r) => r.peak))!,
      peakRel: mean(list.map((r) => r.peak - dPeak.get(r.driver)!))!,
      spreadRatio: mean(ratios) ?? 1,
      wearRel: mean(wears) ?? 0,
      results: list.length,
    })
  }
  return out
}

export interface RadarAxis {
  key: string
  label: string
  /** 0–1, 0,5 = durchschnittliches Auto, außen = besser */
  score: number
  /** Klartext des Messwerts */
  text: string
}

const clamp01 = (v: number) => Math.max(0.04, Math.min(1, v))
/** Feste Spannen statt Min/Max: kleine Unterschiede sehen klein aus */
const score = (good: number, span: number) => clamp01(0.5 + (good / span) * 0.5)

/** Achsen des Netzdiagramms aus bereinigtem Tempo, Abflügen (Schnitt dazu) und Eigenschaften */
export function radarAxes(tempoMs: number | null, crashRate: number | null, avgCrash: number | null, t: CarTraits | undefined): RadarAxis[] {
  const n = (v: number, d = 0) => v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d })
  const sign = (v: number, d = 0) => `${v >= 0 ? '+' : '−'}${n(Math.abs(v), d)}`
  return [
    {
      key: 'tempo', label: 'Tempo',
      score: tempoMs == null ? 0.5 : score(-tempoMs, 400),
      text: tempoMs == null ? 'zu wenig Daten' : `${sign(tempoMs / 1000, 2)} s pro Runde gegenüber dem Ø Auto`,
    },
    {
      key: 'peak', label: 'Spitzen',
      score: t ? score(t.peakRel, 0.12) : 0.5,
      text: t ? `${n(t.peakShare * 100)} % der Runden unter den eigenen besten 10 % (${sign(t.peakRel * 100)} Punkte ggü. sonst)` : 'zu wenig Daten',
    },
    {
      key: 'consistency', label: 'Konstanz',
      score: t ? score(1 - t.spreadRatio, 0.25) : 0.5,
      text: t ? `Rundenzeiten streuen ${t.spreadRatio <= 1 ? 'weniger' : 'mehr'} als sonst (${sign((t.spreadRatio - 1) * 100)} %)` : 'zu wenig Daten',
    },
    {
      key: 'wear', label: 'Reifen',
      score: t ? score(-t.wearRel, 40) : 0.5,
      text: t ? `Rundenzeiten bauen im Rennen ${n(Math.abs(t.wearRel))} ms pro Runde ${t.wearRel > 0 ? 'stärker' : 'weniger'} ab als sonst` : 'zu wenig Daten',
    },
    {
      key: 'safety', label: 'Sicherheit',
      score: crashRate == null || avgCrash == null ? 0.5 : score(avgCrash - crashRate, 8),
      text: crashRate == null ? 'zu wenig Daten' : `${n(crashRate, 1)} Abflüge pro 100 Runden${avgCrash != null ? ` (Ø ${n(avgCrash, 1)})` : ''}`,
    },
  ]
}
