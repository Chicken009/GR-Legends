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
  /** Gesamtsieg in wie viel Prozent der Durchläufe (geteilter Sieg zählt anteilig) */
  winChance: Map<string, number>
  /** Teamsieg in wie viel Prozent der Durchläufe (nur mit Teams) */
  teamChance: Map<string, number>
  /** Warum der Favorit Favorit ist (wenn es einen klaren gibt) */
  reasons: string[]
  /** Anteil der Durchläufe, in denen Platz 1 und 2 höchstens 2 Punkte trennen */
  close: number
  /** Teams (bzw. ohne Teams: Fahrer) mit deutlich geringerer Siegchance und warum */
  underdogs: { name: string; chance: number; reasons: string[] }[]
}

/**
 * Wechselzeit vor einem Lauf (Minuten): Grundzeit plus je Fahrer, der neu an einen Regler geht, und
 * je Auto, das neu auf die Bahn kommt. Abgeglichen mit den Zeitstempeln eines Smartrace-Backups:
 * etwa eine Minute je neuem Fahrer; Autos wechselten dort fast immer mit, ihr Anteil ist geschätzt.
 */
export const CHANGEOVER_MIN = { base: 1, perDriver: 1, perCar: 0.5 }

/** Wechselzeit vor jedem Lauf (der erste Lauf hat keine); ohne geplantes Auto bringt jeder sein eigenes mit */
export function changeoverMinutes(heats: { order: string[]; cars: Record<string, string> }[]): number {
  let total = 0
  for (let i = 1; i < heats.length; i++) {
    const carsOf = (h: (typeof heats)[number]) => new Set(h.order.map((n) => h.cars[n] ?? `\u0000${n}`))
    const before = new Set(heats[i - 1].order)
    const beforeCars = carsOf(heats[i - 1])
    const drivers = heats[i].order.filter((n) => !before.has(n)).length
    const cars = [...carsOf(heats[i])].filter((c) => !beforeCars.has(c)).length
    total += CHANGEOVER_MIN.base + drivers * CHANGEOVER_MIN.perDriver + cars * CHANGEOVER_MIN.perCar
  }
  return total
}

/** Fahrzeit eines Laufs: Runden × typische Rundenzeit (+10 % für Abflüge) bzw. die feste Zeit – ohne Wechsel */
export const heatDriveMs = (h: { minutes: number | null; laps: number | null; kind: 'quali' | 'race' }, lapMs: number) =>
  h.minutes ? h.minutes * 60_000 : (h.laps ?? (h.kind === 'quali' ? 4 : 10)) * lapMs * 1.1

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
  const teamWins = new Map<string, number>()
  let close = 0
  let first: EventState | null = null
  for (let r = 0; r < runs; r++) {
    const state = playThrough(def, ctx, `${def.seed}|sim|${r}`, lapMs)
    first ??= state
    // Geteilter erster Platz (z. B. Teammitglieder mit gleichen Punkten) zählt anteilig
    const leaders = state.standings.filter((x) => x.rank === 1)
    for (const l of leaders) wins.set(l.name, (wins.get(l.name) ?? 0) + 1 / leaders.length)
    const teamLeaders = state.teamStandings.filter((t) => t.rank === 1)
    for (const t of teamLeaders) teamWins.set(t.name, (teamWins.get(t.name) ?? 0) + 1 / teamLeaders.length)
    const runnerUp = state.standings.find((x) => x.rank > 1)
    const a = state.standings[0]
    if (a && (leaders.length > 1 || (runnerUp && a.total - runnerUp.total <= 2))) close++
  }
  const heats = first?.heats.filter((h) => h.status === 'done') ?? []
  const perDriver = new Map<string, number>()
  for (const h of heats) for (const n of h.order) perDriver.set(n, (perDriver.get(n) ?? 0) + 1)
  const ms = heats.reduce((sum, h) => sum + heatDriveMs(h, lapMs), 0) + changeoverMinutes(heats) * 60_000
  return {
    runs,
    heats: heats.length,
    perDriver,
    minutes: Math.round(ms / 60000),
    winChance: new Map([...wins].map(([n, c]) => [n, c / runs])),
    teamChance: new Map([...teamWins].map(([n, c]) => [n, c / runs])),
    close: runs ? close / runs : 0,
    reasons: favoriteReasons(def, ctx, wins, teamWins, runs, first),
    underdogs: underdogReasons(def, ctx, wins, teamWins, runs, first),
  }
}

/**
 * Wer deutlich geringere Chancen hat (unter zwei Dritteln des gleichen Anteils; ohne Teams unter der Hälfte)
 * und warum: Elo-Schnitt, Teamgröße, Autos laut Plan, Wertung. Mit Teams nur die Teams.
 */
function underdogReasons(def: EventDef, ctx: EventContext, wins: Map<string, number>, teamWins: Map<string, number>, runs: number, state: EventState | null): Simulation['underdogs'] {
  if (!runs || !state) return []
  const sc = def.scoring
  const teams = state.teams.length > 0
  const units = teams ? state.teams.map((t) => ({ name: t.name, drivers: t.drivers })) : state.drivers.map((d) => ({ name: d, drivers: [d] }))
  if (units.length < 2) return []
  const limit = (teams ? 2 / 3 : 1 / 2) / units.length
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
  // Autos laut Plan: Ø Autowertung der eigenen Einsätze gegenüber allen Einsätzen
  const starts = state.heats.filter((h) => h.kind === 'race').flatMap((h) => Object.entries(h.cars).map(([d, c]) => ({ d, v: ctx.car(c) })))
  const allCars = avg(starts.map((x) => x.v))
  const sizes = units.map((u) => u.drivers.length)
  const out: Simulation['underdogs'] = []
  for (const u of units) {
    const chance = (teams ? teamWins : wins).get(u.name) ?? 0
    if (chance / runs >= limit) continue
    const reasons: string[] = []
    const own = avg(u.drivers.map((d) => ctx.elo(d)))
    const others = avg(units.filter((x) => x !== u).map((x) => avg(x.drivers.map((d) => ctx.elo(d)))))
    const gap = Math.round(others - own)
    if (gap >= (teams ? 15 : 40)) reasons.push(teams ? `${u.name} ist im Schnitt ${gap} Elo schwächer als die anderen Teams.` : `${gap} Elo unter dem Schnitt des Feldes.`)
    if (teams && u.drivers.length > Math.min(...sizes)) reasons.push(`Mit ${u.drivers.length} Fahrern wechselt ${u.name} öfter durch – die Stärksten fahren seltener als in kleineren Teams.`)
    const carGap = Math.round(allCars - avg(starts.filter((x) => u.drivers.includes(x.d)).map((x) => x.v)))
    if (starts.length && carGap >= 8) reasons.push(`Fährt laut Plan im Schnitt schwächere Autos (${carGap} Elo unter dem Schnitt).`)
    if (reasons.length) {
      if (sc.method === 'absolute') reasons.push('Absolute Wertung: Jeder geschlagene Gegner zählt gleich – „Fair“ gleicht Stärkeunterschiede aus.')
      else {
        if (sc.win > 0 && !sc.fairWin) reasons.push('Der Siegbonus ist nicht nach Stärke gewichtet und geht meist an die Stärkeren – Option „Siegbonus fair“.')
        reasons.push('„Fair“ gleicht die erwarteten Punkte aus, aber nicht ganz die Siegchance: Bei wenigen Läufen setzt sich der Stärkere öfter durch.')
      }
    } else reasons.push('Kein klarer Grund im Aufbau – eher Zufall bei Auslosung und Paarungen.')
    out.push({ name: u.name, chance: chance / runs, reasons })
  }
  return out.sort((a, b) => a.chance - b.chance)
}

/**
 * Hauptgründe für einen klaren Favoriten (über 50 % Siegchance): Elo-Abstand, Wertung, Bonus,
 * Format und Autos. Nur Regeln, die tatsächlich gelten.
 */
function favoriteReasons(def: EventDef, ctx: EventContext, wins: Map<string, number>, teamWins: Map<string, number>, runs: number, state: EventState | null): string[] {
  if (!runs || !state) return []
  const teams = state.teams.length > 0
  const pool = teams ? teamWins : wins
  const [fav, count] = [...pool].sort((a, b) => b[1] - a[1])[0] ?? []
  if (!fav || count / runs <= 0.5) return []
  const out: string[] = []
  const sc = def.scoring
  if (teams) {
    const strength = (t: EventState['teams'][number]) => t.drivers.reduce((a, d) => a + ctx.elo(d), 0) / Math.max(1, t.drivers.length)
    const t = state.teams.find((x) => x.name === fav)
    const others = state.teams.filter((x) => x.name !== fav)
    if (t && others.length) {
      const gap = Math.round(strength(t) - others.reduce((a, x) => a + strength(x), 0) / others.length)
      if (gap >= 30) out.push(`${fav} ist im Schnitt ${gap} Elo stärker als die anderen Teams – Teams „Nach Elo“ einteilen gleicht das aus.`)
    }
  } else {
    const others = state.drivers.filter((d) => d !== fav)
    if (others.length) {
      const gap = Math.round(ctx.elo(fav) - others.reduce((a, d) => a + ctx.elo(d), 0) / others.length)
      if (gap >= 40) out.push(`${fav} hat ${gap} Elo mehr als der Schnitt des Feldes.`)
    }
  }
  if (sc.method === 'absolute') out.push('Absolute Wertung: Jeder geschlagene Gegner zählt gleich, egal wie stark er ist – „Fair“ gleicht das aus.')
  else if (sc.win > 0 && !sc.fairWin) out.push('Der Siegbonus ist nicht nach Stärke gewichtet – Option „Siegbonus fair“.')
  const bonus = [sc.fastestLap > 0 && `schnellste Runde +${sc.fastestLap}`, sc.pole > 0 && `Pole +${sc.pole}`].filter(Boolean)
  if (bonus.length) out.push(`Bonus für ${bonus.join(' und ')} geht fast immer an die Schnellsten.`)
  for (const sec of def.sections) {
    if (sec.weight <= 0) continue
    if (sec.format === 'ladder' && sec.seeding !== 'random') out.push(`${sec.name}: Die Stärksten starten weiter oben und bekommen Punkte gegen alle, die vorher ausscheiden.`)
    if (sec.format === 'ko' && sec.seeding !== 'random') out.push(`${sec.name}: Die Setzliste verteilt die Stärksten so, dass sie sich erst spät treffen.`)
  }
  const cars = def.cars.mode
  if (cars === 'free' || cars === 'fixed' || cars === 'list') out.push('Die Autos gleichen nichts aus – mit „Nach Können zuteilen“ bekommt der Schwächste das stärkste Auto.')
  return out
}
