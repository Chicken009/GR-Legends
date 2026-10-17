import type { Result, Session } from '../../types'
import { computeEvent, type EventContext, type EventState } from './engine'
import { seededRandom } from './random'
import type { EventDef } from './types'

/** Gumbel-Rauschen mit dieser Skala ergibt genau die Siegchancen der Elo-Formel (Skala 200) */
const NOISE = 200 / Math.LN10

export interface Simulation {
  runs: number
  heats: number
  /** Läufe je Fahrer (im ersten Durchlauf) */
  perDriver: Map<string, number>
  /** Geschätzte Dauer in Minuten */
  minutes: number
  /** Gesamtsieg in wie viel Prozent der Durchläufe */
  winChance: Map<string, number>
  /** Anteil der Durchläufe, in denen Platz 1 und 2 höchstens 2 Punkte trennen */
  close: number
}

function fakeSession(i: number, def: EventDef, heat: EventState['heats'][number], ctx: EventContext, rnd: () => number, lapMs: number): Session {
  const names = heat.entrants.map((e) => e.name!)
  const perf = names.map((n) => {
    const car = heat.cars[n]
    const s = ctx.elo(n) + (car ? ctx.car(car) : 0)
    return { n, car: car ?? '', p: s - NOISE * Math.log(-Math.log(Math.max(1e-9, rnd()))) }
  })
  perf.sort((a, b) => b.p - a.p)
  // Auf Zeit: so viele Runden, wie in die Zeit passen
  const laps = heat.minutes ? Math.max(1, Math.floor((heat.minutes * 60_000) / lapMs)) : (heat.laps ?? (heat.kind === 'quali' ? 4 : 10))
  const results: Result[] = perf.map((x, k) => {
    const best = Math.round(lapMs * (1 - (x.p - 500) / 800 / 100))
    return {
      position: k + 1,
      gap: k === 0 ? { kind: 'leader' } : { kind: 'none' },
      driver: x.n,
      car: x.car,
      laps: heat.kind === 'quali' ? laps : Math.max(1, laps - k),
      bestLapMs: best,
      validBestLapMs: best,
      pitStops: 0,
      lapTimes: [],
    }
  })
  if (heat.kind === 'quali') results.sort((a, b) => a.validBestLapMs! - b.validBestLapMs!).forEach((r, k) => (r.position = k + 1))
  const time = new Date(Date.UTC(2000, 0, 1, 0, i)).toISOString()
  return {
    fileId: `sim-${i}`,
    fileName: `${heat.kind === 'quali' ? 'Qualifikation' : 'Rennen'}_sim.csv`,
    track: def.track ?? '',
    trackLengthCm: null,
    date: def.start,
    type: heat.kind === 'quali' ? 'Qualifikation' : 'Rennen',
    createdTime: time,
    modifiedTime: time,
    heat: 1,
    results,
  }
}

/** Einen Wettkampf einmal durchspielen: Läufe nacheinander mit zufälligen Ergebnissen nach Elo */
export function playThrough(def: EventDef, ctx: EventContext, seed: string, lapMs: number): EventState {
  const rnd = seededRandom(seed)
  const sessions: Session[] = []
  const playDef = { ...def, matches: {} }
  let state = computeEvent(playDef, { ...ctx, sessions })
  for (let i = 0; i < 300 && state.next; i++) {
    sessions.push(fakeSession(i, def, state.next, ctx, rnd, lapMs))
    state = computeEvent(playDef, { ...ctx, sessions: [...sessions] })
  }
  return state
}

/**
 * Probelauf: Der Wettkampf wird mehrfach mit zufälligen Ergebnissen nach Elo durchgespielt.
 * Zeigt, wie viele Läufe es werden, wie lange es dauert, wie oft jeder fährt und wie offen es ist.
 */
export function simulate(def: EventDef, ctx: EventContext, lapMs: number, runs = 120): Simulation {
  const wins = new Map<string, number>()
  let close = 0
  let first: EventState | null = null
  for (let r = 0; r < runs; r++) {
    const state = playThrough(def, ctx, `${def.seed}|sim|${r}`, lapMs)
    first ??= state
    const [a, b] = state.standings
    if (a) wins.set(a.name, (wins.get(a.name) ?? 0) + 1)
    if (a && b && a.total - b.total <= 2) close++
  }
  const heats = first?.heats.filter((h) => h.status === 'done') ?? []
  const perDriver = new Map<string, number>()
  for (const h of heats) for (const n of h.order) perDriver.set(n, (perDriver.get(n) ?? 0) + 1)
  // Pro Lauf: Runden × typische Rundenzeit (+10 % für Abflüge) bzw. die feste Zeit, plus 2 Minuten Wechsel
  const ms = heats.reduce((sum, h) => sum + (h.minutes ? h.minutes * 60_000 : (h.laps ?? (h.kind === 'quali' ? 4 : 10)) * lapMs * 1.1) + 120_000, 0)
  return {
    runs,
    heats: heats.length,
    perDriver,
    minutes: Math.round(ms / 60000),
    winChance: new Map([...wins].map(([n, c]) => [n, c / runs])),
    close: runs ? close / runs : 0,
  }
}
