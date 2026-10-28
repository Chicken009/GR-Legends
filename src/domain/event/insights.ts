import type { Session } from '../../types'
import { isGuest } from '../drivers'
import type { EventState, Heat, Standing } from './engine'
import type { EventDef } from './types'

export type EventPhase = 'planned' | 'running' | 'done'

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const lastDay = (def: EventDef) => def.end ?? def.start

export function eventPhase(def: EventDef, state: EventState, today: string): EventPhase {
  if (state.complete) return 'done'
  if (today > lastDay(def)) return 'done'
  return state.started || today >= def.start ? 'running' : 'planned'
}

/**
 * Steht das Ergebnis fest? Erst wenn alle geplanten Läufe Ergebnisse haben – nicht schon, weil das
 * Datum vorbei ist (fehlt eine Datei, gibt es noch keine Siegerehrung). Ohne Plan („Wie gefahren“)
 * gilt der Wettkampf nach dem letzten Tag als fertig.
 */
export function eventFinished(def: EventDef, state: EventState, today: string): boolean {
  if (state.complete) return true
  const planned = state.heats.some((h) => def.sections.find((s) => s.id === h.sectionId)?.format !== 'free')
  return !planned && state.started && today > lastDay(def)
}

/** Wettkampf in der App zeigen? */
export const eventVisible = (def: EventDef, today: string) => def.show === 'now' || today >= addDays(def.start, -7)

/** Ablauf (Läufe, Besetzung, Autos) zeigen? */
export function planVisible(def: EventDef, today: string): boolean {
  switch (def.showPlan) {
    case 'now':
      return true
    case 'week':
      return today >= addDays(def.start, -7)
    case 'day':
      return today >= addDays(def.start, -1)
    case 'raceday':
      return today >= def.start
  }
}

export const planFromText = (def: EventDef) =>
  ({ now: 'sofort', week: `ab ${fmtDay(addDays(def.start, -7))}`, day: `ab ${fmtDay(addDays(def.start, -1))}`, raceday: `am ${fmtDay(def.start)}` })[def.showPlan]

const fmtDay = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`
const fmt1 = (v: number) => v.toLocaleString('de-DE', { maximumFractionDigits: 1 })
const fmtSec = (ms: number, digits = 2) => `${(ms / 1000).toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits })} s`

/** Höchstmögliche Punkte in einem Lauf (Sieg), gewichtet */
export function maxHeatPoints(state: EventState, heat: Heat): number {
  const sc = state.def.scoring
  const idx = state.sections.findIndex((s) => s.def.id === heat.sectionId)
  const sec = state.sections[idx]
  if (!sec) return 0
  const lastScoring = state.sections.map((s, i) => (s.def.weight > 0 && s.def.format !== 'free' ? i : -1)).reduce((a, b) => Math.max(a, b), -1)
  const factor = sec.def.weight * (idx === lastScoring ? sc.finaleFactor : 1)
  const n = heat.entrants.length
  const base = (n - 1) * sc.perBeaten * (sc.method === 'fair' ? 1.5 : 1) + sc.win
  return Math.round(base * factor * 10) / 10
}

export interface DriverInsight {
  standing: Standing | null
  above: Standing | null
  below: Standing | null
  nextHeat: Heat | null
  /** Was im nächsten Lauf drin ist */
  needs: string[]
  /** Verbesserung aus den Runden des Wettkampfs */
  tips: string[]
}

function eventLaps(state: EventState, driver: string) {
  const res = state.heats.flatMap((h) => (h.session?.results ?? []).filter((r) => r.driver === driver).map((r) => ({ r, h })))
  return res
}

export function driverInsight(state: EventState, driver: string): DriverInsight {
  const standing = state.standings.find((s) => s.name === driver) ?? null
  const idx = standing ? state.standings.indexOf(standing) : -1
  const above = idx > 0 ? state.standings[idx - 1] : null
  const below = idx >= 0 && idx < state.standings.length - 1 ? state.standings[idx + 1] : null
  const nextHeat = state.heats.find((h) => h.status !== 'done' && h.entrants.some((e) => e.name === driver)) ?? null
  const needs: string[] = []
  if (nextHeat) {
    const max = maxHeatPoints(state, nextHeat)
    if (nextHeat.note && /steigen auf|kommen weiter/.test(nextHeat.note)) needs.push(`${nextHeat.label}: ${nextHeat.note} – du musst unter die ersten ${nextHeat.note.match(/\d+/)?.[0] ?? ''}.`)
    if (nextHeat.note === 'Entscheidet den Sieg') needs.push(`${nextHeat.label}: Hier fällt die Entscheidung.`)
    if (standing && above && max > 0) {
      const gap = above.total - standing.total
      if (gap < max) needs.push(`${gap <= 0 ? 'Punktgleich mit' : `${fmt1(gap)} ${gap === 1 ? 'Punkt' : 'Punkte'} hinter`} ${above.name} – mit einem Sieg in ${nextHeat.label} (bis ${fmt1(max)} Punkte) ziehst du vorbei.`)
      else needs.push(`${fmt1(gap)} Punkte bis ${above.name} – in ${nextHeat.label} sind bis zu ${fmt1(max)} drin.`)
    }
    if (standing && standing.rank === 1 && below && max > 0 && standing.total - below.total < max) {
      needs.push(`Du führst, aber ${below.name} ist nur ${fmt1(standing.total - below.total)} Punkte hinter dir.`)
    }
  }
  const tips: string[] = []
  const laps = eventLaps(state, driver)
  const normal = laps.flatMap(({ r }) => r.lapTimes.filter((l) => l.status === 'normal').map((l) => l.ms)).sort((a, b) => a - b)
  if (normal.length >= 8) {
    const best = normal[0]
    const median = normal[Math.floor(normal.length / 2)]
    const loss = median - best
    if (loss / best > 0.035) tips.push(`Deine typische Runde ist ${fmtSec(loss)} langsamer als deine beste. Gleichmäßig fahren bringt hier mehr als noch schneller.`)
  }
  const raceLaps = laps.filter(({ h }) => h.kind === 'race')
  const myCrashes = raceLaps.reduce((a, { r }) => a + r.lapTimes.filter((l) => l.status === 'crash').length, 0)
  const myLaps = raceLaps.reduce((a, { r }) => a + r.laps, 0)
  const field = state.heats.filter((h) => h.kind === 'race').flatMap((h) => (h.session?.results ?? []).filter((r) => !isGuest(r.driver)))
  const fieldCrashes = field.reduce((a, r) => a + r.lapTimes.filter((l) => l.status === 'crash').length, 0)
  const fieldLaps = field.reduce((a, r) => a + r.laps, 0)
  if (myLaps >= 10 && fieldLaps > 0) {
    const mine = (myCrashes / myLaps) * 100
    const avg = (fieldCrashes / fieldLaps) * 100
    if (mine > avg * 1.3 && myCrashes >= 2) tips.push(`${myCrashes} Abflüge bisher – ${fmt1(mine)} pro 100 Runden, das Feld ${fmt1(avg)}. Etwas weniger Gas am Kurvenausgang kostet weniger als ein Abflug.`)
    else if (myCrashes === 0) tips.push('Noch kein Abflug – stark! Sauber bleiben ist dein Vorteil.')
  }
  const quali = state.sections.find((s) => s.def.format === 'quali')
  if (quali?.started) {
    const me = quali.ranking.find((r) => r.name === driver)
    const best = qualiBest(quali.heats.map((h) => h.session).filter((s): s is Session => s != null))
    const mine = best.get(driver)
    const top = Math.min(...best.values())
    if (me && mine != null && mine > top) tips.push(`Im Qualifying ${fmtSec(mine - top, 3)} auf die Pole – das ist der Abstand, den du auf einer Runde gutmachen kannst.`)
  }
  const over = state.overperformance.get(driver)
  if (over != null && over >= 0.8) tips.push(`Du fährst ${fmt1(over)} Plätze über deiner Erwartung laut Elo.`)
  return { standing, above, below, nextHeat, needs, tips }
}

function qualiBest(sessions: Session[]) {
  const best = new Map<string, number>()
  for (const s of sessions) {
    for (const r of s.results) {
      const ms = r.validBestLapMs ?? r.bestLapMs
      if (!isGuest(r.driver) && ms != null && ms < (best.get(r.driver) ?? Infinity)) best.set(r.driver, ms)
    }
  }
  return best
}

/**
 * Lauf-Hinweis ohne die Paarung „Team Rot gegen Team Blau“ (die zeigen die Teamfarben). Übrig bleibt,
 * was die Farben nicht sagen: „Aufstellung 1 von 2“, „Einsatz 2 von 3“, „Top 2 steigen auf“.
 */
export function withoutTeams(note: string, teamNames: string[]): string | null {
  const names = new Set(teamNames)
  const isTeams = (x: string) => x.split(' gegen ').every((n) => names.has(n.trim()))
  const parts = note
    .split(' · ')
    .map((p) => {
      const i = p.indexOf(': ')
      return i >= 0 && isTeams(p.slice(i + 2)) ? p.slice(0, i) : p
    })
    .filter((p) => !isTeams(p))
  return parts.length ? parts.join(' · ') : null
}

/** Endet ein Satz mit einem abgekürzten Namen („Pia S.“), kein zweiter Punkt */
export const endSentence = (s: Story): Story => ({ ...s, text: s.text.replace(/\.\.$/, '.') })

export interface Story {
  icon: 'crown' | 'sword' | 'bolt' | 'rocket' | 'flag' | 'star'
  text: string
}

/** Spannungsmeldungen für Ansicht und Leinwand */
export function storylines(state: EventState): Story[] {
  const out: Story[] = []
  const [a, b] = state.standings
  if (state.complete && a) {
    out.push({ icon: 'crown', text: `${a.name} gewinnt ${state.def.name}!` })
  } else if (a && b && state.started && state.next) {
    const gap = a.total - b.total
    const max = maxHeatPoints(state, state.next)
    if (gap === 0) out.push({ icon: 'crown', text: `Gleichstand an der Spitze: ${a.name} und ${b.name}.` })
    else if (gap < max) out.push({ icon: 'crown', text: `Spannung an der Spitze: ${a.name} führt nur ${fmt1(gap)} ${gap === 1 ? 'Punkt' : 'Punkte'} vor ${b.name}.` })
  }
  if (state.next) {
    const names = state.next.entrants.map((e) => e.name).filter((n): n is string => n != null)
    const done = state.heats.filter((h) => h.status === 'done' && h.kind === 'race').reverse()
    for (const h of done) {
      const both = names.filter((n) => h.order.includes(n))
      if (both.length < 2) continue
      const [winner, ...rest] = both.sort((x, y) => h.order.indexOf(x) - h.order.indexOf(y))
      out.push({ icon: 'sword', text: `Revanche: ${rest[rest.length - 1]} will sich bei ${winner} für ${h.label} revanchieren.` })
      break
    }
  }
  for (const sec of state.sections) {
    if (sec.def.format !== 'ladder') continue
    const climbs = new Map<string, number>()
    for (const h of sec.heats) if (h.status === 'done') for (const n of h.order) climbs.set(n, (climbs.get(n) ?? 0) + 1)
    const best = [...climbs].filter(([, c]) => c >= 3).sort((x, y) => y[1] - x[1])[0]
    if (best) out.push({ icon: 'rocket', text: `${best[0]} kämpft sich durch ${best[1]} Rennen der Leiter nach oben.` })
  }
  const dotd = [...state.overperformance].filter(([n]) => (state.standings.find((s) => s.name === n)?.races ?? 0) >= 2).sort((x, y) => y[1] - x[1])[0]
  if (dotd && dotd[1] > 0.5) out.push({ icon: 'star', text: `Fahrer des Tages${state.complete ? '' : ' bisher'}: ${dotd[0]} – ${fmt1(dotd[1])} Plätze über der Erwartung.` })
  if (state.fastestLap) out.push({ icon: 'bolt', text: `Schnellste Runde: ${state.fastestLap.name} – ${fmtSec(state.fastestLap.ms, 3)}${state.fastestLap.car ? ` im ${state.fastestLap.car}` : ''}.` })
  return out.map(endSentence)
}
