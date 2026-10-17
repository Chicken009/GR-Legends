import type { Session } from '../../types'
import { isGuest } from '../drivers'
import { isQuali } from '../rating'
import { hashString, shuffle } from './random'
import type { CarRule, EventDef, SectionDef, TeamDef } from './types'

/**
 * Ablauf und Wertung eines Wettkampfs. Der Plan entsteht Lauf für Lauf: Jeder Lauf wird
 * aufgestellt, mit der passenden CSV aus dem Wettkampf-Ordner verbunden (nach Besetzung und
 * Reihenfolge, korrigierbar über `def.matches`), und erst sein Ergebnis bestimmt die folgenden
 * Läufe (Aufstiegsleiter, K.-o.). Alles ist deterministisch – jedes Gerät rechnet denselben Plan.
 */

export interface EventContext {
  /** Läufe aus dem Wettkampf-Ordner */
  sessions: Session[]
  /** Elo des Fahrers zu Beginn des Wettkampfs */
  elo: (driver: string) => number
  /** Autowertung auf der Strecke (Elo-Punkte, 0 = Durchschnitt) */
  car: (car: string) => number
  /** Persönliche Bestzeit auf der Strecke vor dem Wettkampf */
  previousBest: (driver: string) => number | null
}

/** Startplatz in einem Lauf: Name, sobald er feststeht, sonst ein Platzhalter („Top 2 aus Rennen 1“) */
export interface Entrant {
  name: string | null
  label: string
}

export type HeatStatus = 'done' | 'next' | 'ready' | 'waiting'

export interface Heat {
  id: string
  sectionId: string
  label: string
  kind: 'quali' | 'race'
  entrants: Entrant[]
  /** Geplante Autos: Fahrer → Auto */
  cars: Record<string, string>
  /** Hinweis bei freier Wahl („Freie Wahl aus: …“) */
  carHint: string | null
  /** Freie Wahl aus dieser Liste (für Bilder in der Ansicht) */
  carChoice: string[] | null
  /** Teamrennen: Fahrer → Team-ID */
  teamOf: Record<string, string> | null
  /** Was der Lauf entscheidet („Top 2 steigen auf“) */
  note: string | null
  session: Session | null
  /** CSV per Hand zugeordnet */
  manual: boolean
  status: HeatStatus
  /** Reihenfolge im Ziel (nur Fahrer, keine Gäste) */
  order: string[]
  /** Punkte in diesem Lauf (vor Gewichtung) */
  points: Map<string, number>
  /** Teamrennen: Punkte je Team */
  teamPoints: Map<string, number> | null
  /** Aufstiegsleiter / K.-o.: wer aus diesem Lauf weiterkommt (Punkte gibt es hier erst für den Endstand) */
  advancing: string[] | null
  /** Rundenzahl laut Plan */
  laps: number | null
}

export interface RankRow {
  name: string
  rank: number
  points: number
  /** Kurzinfo („Finale P2“, „0:10,512“) */
  detail: string
}

/** Wie ein Teamrennen-Abschnitt aufgeteilt wird (für den Editor) */
export interface TeamPlan {
  /** all = alle zusammen · pairs = zwei Teams je Lauf · groups = mehrere Teams je Lauf · slots = Positionsduelle */
  mode: 'all' | 'pairs' | 'groups' | 'slots'
  /** Läufe in einem vollen Durchgang */
  perRound: number
  /** Halber Durchgang möglich (pairs mit mindestens 4 Teams) */
  halfPossible: boolean
  /** Läufe in einem halben Durchgang */
  halfCount: number
}

export interface SectionState {
  def: SectionDef
  heats: Heat[]
  ranking: RankRow[]
  teamRanking: RankRow[] | null
  started: boolean
  complete: boolean
  teamPlan?: TeamPlan
}

export interface Bonus {
  kind: 'fastestLap' | 'pole' | 'driverOfDay' | 'personalBest' | 'clean'
  label: string
  points: number
}

export interface Standing {
  name: string
  rank: number
  total: number
  /** Punkte je Abschnitt (gewichtet, mit Finalbonus) */
  sections: number[]
  bonuses: Bonus[]
  races: number
  wins: number
  bestLapMs: number | null
  team: string | null
  teamId: string | null
}

export interface TeamState {
  id: string
  name: string
  drivers: string[]
  /** Summe der Elo der Mitglieder zu Beginn des Wettkampfs */
  elo: number
}

export interface TeamStanding {
  id: string
  name: string
  drivers: string[]
  rank: number
  /** Schnitt der Gesamtpunkte der Mitglieder */
  points: number
  /** Summe der Elo der Mitglieder zu Beginn des Wettkampfs */
  elo: number
}

export interface EventState {
  def: EventDef
  drivers: string[]
  teams: TeamState[]
  sections: SectionState[]
  /** Alle Läufe in Fahrreihenfolge */
  heats: Heat[]
  standings: Standing[]
  teamStandings: TeamStanding[]
  next: Heat | null
  /** Läufe im Ordner, die keinem Lauf zugeordnet werden konnten */
  unmatched: Session[]
  started: boolean
  complete: boolean
  /** Über/unter der Erwartung (in geschlagenen Gegnern) je Fahrer, nur Rennen */
  overperformance: Map<string, number>
  fastestLap: { name: string; ms: number; car: string } | null
  warnings: string[]
}

const named = (name: string): Entrant => ({ name, label: name })
const placeholder = (label: string): Entrant => ({ name: null, label })

/** Siegchance von a gegen b (Elo, halbe Skala wie in der Wertung) */
export const winProb = (a: number, b: number) => 1 / (1 + 10 ** ((b - a) / 200))

/** In `count` Gruppen verteilen, Schlangenreihenfolge (1-2-3-3-2-1 …) */
export function snake<T>(list: T[], count: number): T[][] {
  const groups: T[][] = Array.from({ length: Math.max(1, count) }, () => [])
  list.forEach((x, i) => {
    const round = Math.floor(i / groups.length)
    const pos = i % groups.length
    groups[round % 2 === 0 ? pos : groups.length - 1 - pos].push(x)
  })
  return groups
}

/** In möglichst gleich große Gruppen von höchstens `size` teilen (der Reihe nach) */
export function chunkEven<T>(list: T[], size: number): T[][] {
  const count = Math.max(1, Math.ceil(list.length / Math.max(1, size)))
  const base = Math.floor(list.length / count)
  const extra = list.length % count
  const out: T[][] = []
  let i = 0
  for (let k = 0; k < count; k++) {
    const n = base + (k < extra ? 1 : 0)
    out.push(list.slice(i, i + n))
    i += n
  }
  return out.filter((g) => g.length)
}

/**
 * Teams bilden. elo: Schlangenverteilung nach Stärke (ausgeglichen); random: ausgelost mit
 * Startwert; manual: wie festgelegt. Geht die Teamgröße nicht auf, werden einzelne Teams größer –
 * gewertet wird mit dem Schnitt, das bleibt fair.
 */
export function buildTeams(def: EventDef, drivers: string[], elo: (n: string) => number): { teams: TeamState[]; warnings: string[] } {
  const rule = def.teams
  if (!rule) return { teams: [], warnings: [] }
  const warnings: string[] = []
  if (rule.mode === 'manual' && rule.teams.length) {
    const known = new Set(drivers)
    const teams = rule.teams.map((t, i) => ({ id: `t${i + 1}`, name: t.name, drivers: t.drivers.filter((d) => known.has(d)) }))
    const placed = new Set(teams.flatMap((t) => t.drivers))
    const missing = drivers.filter((d) => !placed.has(d))
    if (missing.length) {
      warnings.push(`Ohne Team: ${missing.join(', ')} – kommen ins kleinste Team.`)
      for (const d of missing) [...teams].sort((a, b) => a.drivers.length - b.drivers.length)[0]?.drivers.push(d)
    }
    return { teams: withElo(teams.filter((t) => t.drivers.length), elo), warnings }
  }
  const count = Math.max(1, Math.floor(drivers.length / Math.max(1, rule.size)))
  const ordered = rule.mode === 'random' ? shuffle(drivers, `${def.seed}|teams`) : [...drivers].sort((a, b) => elo(b) - elo(a) || a.localeCompare(b))
  const groups = rule.mode === 'random' ? ordered.reduce<string[][]>((g, d, i) => (g[i % count].push(d), g), Array.from({ length: count }, () => [])) : snake(ordered, count)
  const names = rule.teams.map((t) => t.name)
  return { teams: withElo(groups.map((g, i) => ({ id: `t${i + 1}`, name: names[i] || `Team ${i + 1}`, drivers: g })).filter((t) => t.drivers.length), elo), warnings }
}

const withElo = (teams: Omit<TeamState, 'elo'>[], elo: (n: string) => number): TeamState[] =>
  teams.map((t) => ({ ...t, elo: Math.round(t.drivers.reduce((a, d) => a + elo(d), 0)) }))

/** Teams als feste Liste (für den Losknopf / „Festschreiben“) */
export const teamsAsDefs = (teams: TeamState[]): TeamDef[] => teams.map((t) => ({ name: t.name, drivers: [...t.drivers] }))

/** Teamgrößen als Text: „2 + 2 + 3“ */
export const teamSplit = (teams: TeamState[]) => teams.map((t) => t.drivers.length).join(' + ')

// ---------------------------------------------------------------------------------------------

interface Env {
  def: EventDef
  ctx: EventContext
  sessions: Session[]
  used: Set<string>
  ignored: Set<string>
  manualFor: Map<string, Session>
  manualIds: Set<string>
  /** Zeitpunkt der zuletzt zugeordneten Datei – automatische Zuordnung geht nur vorwärts */
  lastTime: string
  /** Wie viele Läufe jeder Fahrer schon geplant hat (für das Durchtauschen der Autos) */
  heatCount: Map<string, number>
  carBase: Map<string, number>
  heats: Heat[]
}

const strengthOf = (env: Env, name: string, car?: string) => env.ctx.elo(name) + (car ? env.ctx.car(car) : 0)

/** Punkte für eine Reihenfolge: je geschlagenem Gegner + Sieg; fair: gegen Stärkere mehr */
function orderPoints(env: Env, order: string[], strength: (n: string) => number): Map<string, number> {
  const sc = env.def.scoring
  const pts = new Map<string, number>()
  order.forEach((name, i) => {
    let p = 0
    for (let j = i + 1; j < order.length; j++) {
      if (sc.method === 'fair') p += 2 * (1 - winProb(strength(name), strength(order[j]))) * sc.perBeaten
      else p += sc.perBeaten
    }
    if (i === 0 && order.length > 1) p += sc.win
    pts.set(name, Math.round(p * 10) / 10)
  })
  return pts
}

function carsFor(env: Env, rule: CarRule, names: string[], heatId: string): { cars: Record<string, string>; hint: string | null } {
  const cars: Record<string, string> = {}
  const override = env.def.overrides[heatId]?.cars
  const pool = rule.pool
  switch (rule.mode) {
    case 'free':
      break
    case 'list':
      break
    case 'fixed':
      for (const n of names) if (rule.fixed[n]) cars[n] = rule.fixed[n]
      break
    case 'skill': {
      if (!pool.length) break
      // Schwächster Fahrer bekommt das stärkste Auto
      const drivers = [...names].sort((a, b) => env.ctx.elo(a) - env.ctx.elo(b) || a.localeCompare(b))
      const ranked = [...pool].sort((a, b) => env.ctx.car(b) - env.ctx.car(a) || a.localeCompare(b))
      drivers.forEach((d, i) => (cars[d] = ranked[i % ranked.length]))
      break
    }
    case 'random': {
      if (!pool.length) break
      // Jeder Fahrer hat einen ausgelosten Startplatz in der Liste und rückt mit jedem Lauf eins weiter
      const taken = new Set<string>()
      for (const d of names) {
        if (!env.carBase.has(d)) env.carBase.set(d, hashString(`${env.def.seed}|car|${d}`) % pool.length)
        const start = (env.carBase.get(d)! + (env.heatCount.get(d) ?? 0)) % pool.length
        let k = 0
        while (k < pool.length && taken.has(pool[(start + k) % pool.length])) k++
        const car = pool[(start + (k < pool.length ? k : 0)) % pool.length]
        taken.add(car)
        cars[d] = car
      }
      break
    }
  }
  if (override) for (const [d, c] of Object.entries(override)) if (names.includes(d)) cars[d] = c
  const hint = rule.mode === 'free' ? null : rule.mode === 'list' && pool.length ? `Freie Wahl aus: ${pool.join(', ')}` : null
  return { cars, hint }
}

/** Höchstzahl gleichzeitig wegen der Autoliste (freie Wahl, nach Können, zufällig) – null = keine Grenze */
export function carCap(rule: CarRule): number | null {
  return (rule.mode === 'list' || rule.mode === 'skill' || rule.mode === 'random') && rule.pool.length ? rule.pool.length : null
}

const driverSet = (s: Session) => s.results.filter((r) => !isGuest(r.driver)).map((r) => r.driver)

/** Passende CSV zu einem Lauf suchen (manuell zugeordnet > gleiche Besetzung > ähnliche Besetzung) */
function matchSession(env: Env, heat: Heat): { session: Session | null; manual: boolean } {
  const manual = env.manualFor.get(heat.id)
  if (manual && !env.used.has(manual.fileId)) return { session: manual, manual: true }
  const names = heat.entrants.map((e) => e.name)
  if (names.some((n) => n == null)) return { session: null, manual: false }
  const want = new Set(names as string[])
  const candidates = env.sessions.filter(
    (s) => !env.used.has(s.fileId) && !env.ignored.has(s.fileId) && !env.manualIds.has(s.fileId) && isQuali(s) === (heat.kind === 'quali'),
  )
  // Gleiche Besetzung: Reihenfolge egal (z. B. Einzel-Qualifying in anderer Reihenfolge gefahren)
  const exact = candidates.find((s) => {
    const got = driverSet(s)
    return got.length === want.size && got.every((d) => want.has(d))
  })
  if (exact) return { session: exact, manual: false }
  // Jemand ist eingesprungen: mindestens die Hälfte der geplanten Fahrer ist dabei, und die Datei
  // kam nach der zuletzt zugeordneten (sonst gehört sie wahrscheinlich zu einem anderen Lauf)
  const similar = candidates.filter((s) => s.createdTime >= env.lastTime).find((s) => {
    const got = driverSet(s)
    const overlap = got.filter((d) => want.has(d)).length
    return overlap >= Math.max(1, Math.ceil(want.size / 2)) && overlap / new Set([...got, ...want]).size >= 0.5
  })
  return { session: similar ?? null, manual: false }
}

/** Reihenfolge eines gefahrenen Laufs: Rennen nach Platz, Qualifying nach schnellster Runde */
function finishOrder(s: Session, kind: 'quali' | 'race'): string[] {
  const rows = s.results.filter((r) => !isGuest(r.driver))
  if (kind === 'quali') {
    return [...rows].sort((a, b) => (a.validBestLapMs ?? a.bestLapMs ?? Infinity) - (b.validBestLapMs ?? b.bestLapMs ?? Infinity) || a.position - b.position).map((r) => r.driver)
  }
  return [...rows].sort((a, b) => a.position - b.position).map((r) => r.driver)
}

/** Lauf aufstellen, Autos zuteilen, CSV zuordnen und auswerten */
function addHeat(
  env: Env,
  sec: SectionDef,
  init: { id: string; label: string; kind: 'quali' | 'race'; entrants: Entrant[]; note?: string | null; teamOf?: Record<string, string> | null },
): Heat {
  const over = env.def.overrides[init.id]
  const entrants = over?.drivers?.length ? over.drivers.map(named) : init.entrants
  const names = entrants.map((e) => e.name).filter((n): n is string => n != null)
  const rule = sec.cars ?? env.def.cars
  const { cars, hint } = names.length === entrants.length ? carsFor(env, rule, names, init.id) : { cars: {}, hint: null }
  const heat: Heat = {
    id: init.id,
    sectionId: sec.id,
    label: init.label,
    kind: init.kind,
    entrants,
    cars,
    carHint: hint,
    carChoice: rule.mode === 'list' && rule.pool.length ? rule.pool : null,
    teamOf: init.teamOf ?? null,
    note: init.note ?? null,
    session: null,
    manual: false,
    status: entrants.length && names.length === entrants.length ? 'ready' : 'waiting',
    order: [],
    points: new Map(),
    teamPoints: null,
    advancing: null,
    laps: sec.laps ?? null,
  }
  const { session, manual } = matchSession(env, heat)
  if (session) {
    env.used.add(session.fileId)
    if (!manual && session.createdTime > env.lastTime) env.lastTime = session.createdTime
    heat.session = session
    heat.manual = manual
    heat.status = 'done'
    heat.order = finishOrder(session, heat.kind)
    const driven = new Map(session.results.map((r) => [r.driver, r.car]))
    heat.points = orderPoints(env, heat.order, (n) => strengthOf(env, n, driven.get(n)))
    // Gefahrene Besetzung gilt (auch wenn jemand eingesprungen ist)
    heat.entrants = heat.order.map(named)
  }
  for (const n of heat.entrants.map((e) => e.name)) if (n) env.heatCount.set(n, (env.heatCount.get(n) ?? 0) + 1)
  env.heats.push(heat)
  return heat
}

/** Platzierungspunkte aus einer Rangliste (Abschnitte, die nach Endstand werten) */
function rankingFromOrder(env: Env, order: string[], detail: (n: string) => string): RankRow[] {
  const pts = orderPoints(env, order, (n) => env.ctx.elo(n))
  return order.map((name, i) => ({ name, rank: i + 1, points: pts.get(name) ?? 0, detail: detail(name) }))
}

type Exit = Map<string, { level: number; pos: number; decided: boolean }>

/**
 * Endstand für Aufstiegsleiter und K.-o.: Wer weiter oben ausscheidet, steht vorne; im selben
 * Lauf entscheidet der Platz. Punkte gibt es nur gegen Fahrer, die sicher dahinter landen – so
 * bekommt niemand Punkte für Rennen, die er noch gar nicht gefahren ist, und kein Punktestand
 * sinkt im Lauf des Abends. Wer noch fährt, hat damit seine Mindestpunkte.
 */
function rankingFromExit(env: Env, exit: Exit, detail: (n: string) => string): RankRow[] {
  const sc = env.def.scoring
  const names = [...exit.keys()]
  const key = (n: string) => exit.get(n)!
  const ordered = names.sort((a, b) => key(b).level - key(a).level || Number(key(b).decided) - Number(key(a).decided) || key(a).pos - key(b).pos)
  const allDecided = names.every((n) => key(n).decided)
  const below = (x: string, y: string) => {
    const a = key(x)
    const b = key(y)
    if (!b.decided) return false
    if (b.level < a.level) return true
    return a.decided && b.level === a.level && b.pos > a.pos
  }
  const rows = ordered.map((name) => {
    let p = 0
    for (const other of ordered) {
      if (other === name || !below(name, other)) continue
      p += sc.method === 'fair' ? 2 * (1 - winProb(env.ctx.elo(name), env.ctx.elo(other))) * sc.perBeaten : sc.perBeaten
    }
    if (allDecided && name === ordered[0] && ordered.length > 1) p += sc.win
    return { name, rank: 0, points: Math.round(p * 10) / 10, detail: detail(name) }
  })
  // Gleicher Platz in der gleichen Runde (K.-o. mit mehreren Läufen) = gleicher Rang
  rows.forEach((r, i) => {
    const prev = rows[i - 1]
    const same = prev && key(prev.name).decided && key(r.name).decided && key(prev.name).level === key(r.name).level && key(prev.name).pos === key(r.name).pos
    r.rank = same ? prev.rank : i + 1
  })
  return rows
}

/** Rangliste aus Punktesummen der Läufe */
function rankingFromSums(heats: Heat[], drivers: string[]): RankRow[] {
  const sum = new Map<string, number>()
  const wins = new Map<string, number>()
  const races = new Map<string, number>()
  for (const d of drivers) sum.set(d, 0)
  for (const h of heats) {
    if (h.status !== 'done') continue
    for (const [n, p] of h.points) {
      sum.set(n, (sum.get(n) ?? 0) + p)
      races.set(n, (races.get(n) ?? 0) + 1)
    }
    if (h.kind === 'race' && h.order[0] && h.order.length > 1) wins.set(h.order[0], (wins.get(h.order[0]) ?? 0) + 1)
  }
  const rows = [...sum].sort((a, b) => b[1] - a[1] || (wins.get(b[0]) ?? 0) - (wins.get(a[0]) ?? 0) || a[0].localeCompare(b[0]))
  return rows.map(([name, points], i) => {
    const r = races.get(name) ?? 0
    const w = wins.get(name) ?? 0
    return { name, rank: i + 1, points: Math.round(points * 10) / 10, detail: `${r} ${r === 1 ? 'Lauf' : 'Läufe'}${w ? ` · ${w} ${w === 1 ? 'Sieg' : 'Siege'}` : ''}` }
  }).map((row, i, all) => (i > 0 && all[i - 1].points === row.points ? { ...row, rank: all[i - 1].rank } : row))
}

const fmtLap = (ms: number) => `${Math.floor(ms / 60000) ? `${Math.floor(ms / 60000)}:` : ''}${((ms % 60000) / 1000).toFixed(3).replace('.', ',')} s`

// ---- Formate ---------------------------------------------------------------------------------

function sectionQuali(env: Env, sec: SectionDef, seeds: Entrant[], per: number): Omit<SectionState, 'def'> {
  // Stärkste zum Schluss – das macht es spannend
  const order = [...seeds].reverse()
  const groups = chunkEven(order, per)
  const heats = groups.map((g, k) => addHeat(env, sec, { id: `${sec.id}-${k + 1}`, label: groups.length > 1 ? `Quali ${k + 1}` : 'Qualifying', kind: 'quali', entrants: g, note: sec.laps ? `${sec.laps} Runden, schnellste zählt` : 'Schnellste Runde zählt' }))
  const best = new Map<string, number>()
  for (const h of heats) {
    for (const r of h.session?.results ?? []) {
      if (isGuest(r.driver)) continue
      const ms = r.validBestLapMs ?? r.bestLapMs
      if (ms != null && ms < (best.get(r.driver) ?? Infinity)) best.set(r.driver, ms)
    }
  }
  const known = seeds.map((e) => e.name).filter((n): n is string => n != null)
  const extra = [...best.keys()].filter((n) => !known.includes(n))
  const all = [...known, ...extra]
  const ordered = [...all].sort((a, b) => (best.get(a) ?? Infinity) - (best.get(b) ?? Infinity) || all.indexOf(a) - all.indexOf(b))
  const complete = heats.every((h) => h.status === 'done')
  return {
    heats,
    ranking: rankingFromOrder(env, ordered, (n) => (best.has(n) ? fmtLap(best.get(n)!) : 'keine Zeit')),
    teamRanking: null,
    started: heats.some((h) => h.status === 'done'),
    complete,
  }
}

/** Erwartete Punkte je Fahrer in einem Lauf mit n Fahrern (absolute Wertung) */
const expectedPoints = (env: Env, n: number) => (n > 1 ? (env.def.scoring.perBeaten * (n - 1)) / 2 + env.def.scoring.win / n : 0)

/**
 * Rennen mit weniger Fahrern bringen weniger Punkte (weniger Gegner zum Schlagen). Deshalb werden
 * die Punkte kleinerer Läufe auf die größte Laufgröße des Abschnitts hochgerechnet (eine Nachkommastelle).
 */
function scaleToBiggest(env: Env, heats: Heat[]) {
  for (const kind of ['race', 'quali'] as const) {
    const list = heats.filter((h) => h.kind === kind)
    const ref = expectedPoints(env, Math.max(0, ...list.map((h) => h.entrants.length)))
    for (const h of list) {
      const e = expectedPoints(env, h.order.length)
      if (h.status !== 'done' || !(e > 0) || !(ref > e)) continue
      h.points = new Map([...h.points].map(([n, p]) => [n, Math.round(p * (ref / e) * 10) / 10]))
    }
  }
}

function sectionRaces(env: Env, sec: SectionDef, seeds: Entrant[], per: number): Omit<SectionState, 'def'> {
  const rounds = sec.rounds ?? 1
  const heats: Heat[] = []
  const count = Math.max(1, Math.ceil(seeds.length / per))
  // Wie oft jemand schon im kleineren Lauf war – das wird reihum verteilt
  const small = new Map<string, number>()
  let k = 0
  for (let r = 0; r < rounds; r++) {
    // Erster Durchgang: ausgeglichene Gruppen nach Startreihenfolge, danach neu gemischt
    let groups = snake(r === 0 ? seeds : shuffle(seeds, `${env.def.seed}|${sec.id}|${r}`), count).filter((g) => g.length)
    const big = Math.max(...groups.map((g) => g.length))
    if (r > 0 && groups.some((g) => g.length < big)) {
      // Wer bisher am seltensten im kleineren Lauf war, kommt jetzt dorthin (bei Gleichstand bleibt die Auslosung)
      const pool = groups.flat()
      const byCount = [...pool].sort((a, b) => (small.get(a.label) ?? 0) - (small.get(b.label) ?? 0))
      const need = groups.filter((g) => g.length < big).reduce((a, g) => a + g.length, 0)
      const toSmall = new Set(byCount.slice(0, need))
      const smallList = pool.filter((e) => toSmall.has(e))
      const bigList = pool.filter((e) => !toSmall.has(e))
      groups = groups.map((g) => (g.length < big ? smallList : bigList).splice(0, g.length))
    }
    for (const g of groups) {
      if (g.length < big) for (const e of g) small.set(e.label, (small.get(e.label) ?? 0) + 1)
      k++
      heats.push(addHeat(env, sec, { id: `${sec.id}-r${r + 1}-${k}`, label: `Rennen ${k}`, kind: 'race', entrants: g, note: rounds > 1 ? `Durchgang ${r + 1} von ${rounds}` : null }))
    }
  }
  scaleToBiggest(env, heats)
  const drivers = seeds.map((e) => e.name).filter((n): n is string => n != null)
  return { heats, ranking: rankingFromSums(heats, drivers), teamRanking: null, started: heats.some((h) => h.status === 'done'), complete: heats.every((h) => h.status === 'done') }
}

/**
 * Aufstiegsleiter: Die schwächsten Fahrer fahren zuerst, die besten `advance` steigen ins nächste
 * Rennen auf, bis im Finale die Stärksten der Startreihenfolge warten.
 */
export function ladderSizes(n: number, per: number, advance: number): number[] {
  // Anzahl direkt gesetzter Fahrer je Lauf, von unten nach oben
  if (n <= per) return [n]
  const step = Math.max(1, per - advance)
  let upper = 1
  while (n - upper * step > per) upper++
  return [n - upper * step, ...Array.from({ length: upper }, () => step)]
}

/**
 * Automatische Aufstiegsleiter: In jedem Rennen steigt die Hälfte auf (abgerundet, mindestens einer).
 * Alle Rennen sind voll; fehlen Fahrer, werden die untersten Rennen um je zwei kleiner – so bleiben
 * die Rennen möglichst gleich groß. Ergebnis von unten nach oben: direkt gesetzte Fahrer und Aufsteiger je Rennen.
 */
export function ladderAuto(n: number, per: number): { direct: number[]; advance: number[] } {
  if (n <= per) return { direct: [n], advance: [0] }
  const up = (size: number) => Math.max(1, Math.floor(size / 2))
  const directOf = (sizes: number[]) => sizes.map((sz, i) => sz - (i ? up(sizes[i - 1]) : 0))
  for (let levels = 2; levels <= n; levels++) {
    const sizes = Array.from({ length: levels }, () => per)
    let missing = directOf(sizes).reduce((a, b) => a + b, 0) - n
    if (missing < 0) continue
    // Von unten nach oben reihum um zwei verkleinern (das Finale bleibt voll), zum Schluss
    // notfalls um einen (bei ungerader Spurzahl)
    for (const step of [2, 1]) {
      let changed = true
      while (missing > 0 && changed) {
        changed = false
        for (let i = 0; i < levels - 1 && missing > 0; i++) {
          const next = [...sizes]
          next[i] -= step
          const d = directOf(next)
          const left = d.reduce((a, b) => a + b, 0) - n
          if (next[i] >= 2 && d.every((x) => x >= 1) && left < missing) {
            sizes[i] = next[i]
            missing = left
            changed = true
          }
        }
      }
    }
    if (missing === 0) return { direct: directOf(sizes), advance: sizes.map((sz, i) => (i === levels - 1 ? 0 : up(sz))) }
  }
  const direct = ladderSizes(n, per, up(per))
  return { direct, advance: direct.map((_, i) => (i === direct.length - 1 ? 0 : up(per))) }
}

function sectionLadder(env: Env, sec: SectionDef, seeds: Entrant[], per: number): Omit<SectionState, 'def'> {
  if (!seeds.length) return { heats: [], ranking: [], teamRanking: null, started: false, complete: false }
  const fixed = Math.min(sec.advance ?? 2, per - 1)
  const auto = sec.advanceAuto ? ladderAuto(seeds.length, per) : null
  const sizes = auto ? auto.direct : ladderSizes(seeds.length, per, fixed)
  const heats: Heat[] = []
  // Setzliste: beste zuerst – unten fahren die letzten
  let rest = [...seeds]
  const direct: Entrant[][] = []
  for (let i = sizes.length - 1; i >= 0; i--) {
    direct[i] = rest.slice(0, sizes[i])
    rest = rest.slice(sizes[i])
  }
  // Ausscheiden: Ebene und Platz im Lauf
  const exit: Exit = new Map()
  let carry: Entrant[] = []
  for (let level = 0; level < sizes.length; level++) {
    const top = level === sizes.length - 1
    const advance = auto ? auto.advance[level] : fixed
    const label = top && sizes.length > 1 ? 'Finale' : `Rennen ${level + 1}`
    const entrants = [...carry, ...direct[level]]
    const heat = addHeat(env, sec, {
      id: `${sec.id}-L${level + 1}`,
      label,
      kind: 'race',
      entrants,
      note: top ? 'Entscheidet den Sieg' : advance === 1 ? 'Der Sieger steigt auf' : `Top ${advance} steigen auf`,
    })
    heats.push(heat)
    if (heat.status === 'done') {
      const up = top ? [] : heat.order.slice(0, advance)
      heat.order.forEach((n, i) => exit.set(n, { level, pos: i, decided: !up.includes(n) }))
      heat.advancing = up
      heat.points = new Map()
      carry = up.map(named)
    } else {
      for (const e of heat.entrants) if (e.name) exit.set(e.name, { level, pos: seeds.findIndex((s) => s.name === e.name), decided: false })
      carry = Array.from({ length: advance }, (_, i) => placeholder(`Platz ${i + 1} aus ${label}`))
    }
  }
  const complete = heats.every((h) => h.status === 'done')
  return {
    heats,
    ranking: rankingFromExit(env, exit, (n) => {
      const e = exit.get(n)!
      const h = heats[e.level]
      return e.decided ? `${h.label} P${e.pos + 1}` : `startet in ${h.label}`
    }),
    teamRanking: null,
    started: heats.some((h) => h.status === 'done'),
    complete,
  }
}

/**
 * K.-o.: Gruppen so gleich groß wie möglich. In jeder Gruppe scheiden gleich viele aus – so viele,
 * wie es die kleinste Gruppe bei `advance` Weiterkommenden zulässt. Größere Gruppen bringen also
 * einen mehr weiter, statt dass dort das Weiterkommen schwerer ist.
 */
function sectionKo(env: Env, sec: SectionDef, seeds: Entrant[], per: number): Omit<SectionState, 'def'> {
  if (!seeds.length) return { heats: [], ranking: [], teamRanking: null, started: false, complete: false }
  const heats: Heat[] = []
  const exit: Exit = new Map()
  let field = [...seeds]
  let level = 0
  while (field.length) {
    const final = field.length <= per
    const count = final ? 1 : Math.ceil(field.length / per)
    const groups = snake(field, count).filter((g) => g.length)
    const minSize = Math.min(...groups.map((g) => g.length))
    const out = final ? 0 : Math.max(1, minSize - Math.min(sec.advance ?? 1, per - 1, minSize - 1))
    const nextCount = field.length - out * groups.length
    const semi = !final && nextCount <= per
    const next: Entrant[] = []
    groups.forEach((g, k) => {
      const label = final ? 'Finale' : semi ? `Halbfinale ${k + 1}` : `Runde ${level + 1} · Lauf ${k + 1}`
      const adv = final ? 0 : g.length - out
      const heat = addHeat(env, sec, { id: `${sec.id}-r${level + 1}-${k + 1}`, label: groups.length === 1 && !final ? `Runde ${level + 1}` : label, kind: 'race', entrants: g, note: final ? 'Entscheidet den Sieg' : `Top ${adv} kommen weiter` })
      heats.push(heat)
      if (heat.status === 'done') {
        const up = heat.order.slice(0, adv)
        // Ausgeschiedene zählen ab dem ersten Ausgeschiedenen – gleich weit gekommen = gleicher Platz
        heat.order.forEach((n, i) => exit.set(n, { level, pos: i < adv ? i : i - adv, decided: i >= adv }))
        heat.advancing = up
        heat.points = new Map()
        next.push(...up.map(named))
      } else {
        for (const e of heat.entrants) if (e.name) exit.set(e.name, { level, pos: seeds.findIndex((s) => s.name === e.name), decided: false })
        next.push(...Array.from({ length: adv }, (_, i) => placeholder(`Platz ${i + 1} aus ${heat.label}`)))
      }
    })
    if (final || next.length >= field.length) break
    field = next
    level++
  }
  return {
    heats,
    ranking: rankingFromExit(env, exit, (n) => {
      const e = exit.get(n)!
      const h = heats.find((x) => x.entrants.some((en) => en.name === n) && x.id.includes(`-r${e.level + 1}-`))
      const place = h?.order.indexOf(n) ?? -1
      return e.decided ? `${h?.label ?? ''} P${place + 1}` : `startet in ${h?.label ?? 'Runde 1'}`
    }),
    teamRanking: null,
    started: heats.some((h) => h.status === 'done'),
    complete: heats.every((h) => h.status === 'done'),
  }
}

/** Kreis-Verfahren: jede Paarung einmal */
function roundRobin<T>(list: T[]): [T, T][][] {
  const items: (T | null)[] = [...list]
  if (items.length % 2) items.push(null)
  const rounds: [T, T][][] = []
  for (let r = 0; r < items.length - 1; r++) {
    const pairs: [T, T][] = []
    for (let i = 0; i < items.length / 2; i++) {
      const a = items[i]
      const b = items[items.length - 1 - i]
      if (a != null && b != null) pairs.push([a, b])
    }
    rounds.push(pairs)
    items.splice(1, 0, items.pop()!)
  }
  return rounds
}

/**
 * Halber Durchgang: so viele Runden des Kreis-Verfahrens, dass jedes Team gegen etwa die Hälfte
 * der anderen fährt – ausgewählt so, dass die Gegner aller Teams im Schnitt möglichst gleich stark sind.
 */
function balancedHalf<T>(rounds: [T, T][][], strength: (t: T) => number): [T, T][][] {
  const want = Math.ceil(rounds.length / 2)
  if (rounds.length > 13) return rounds.slice(0, want)
  let best: number[] = []
  let bestScore = Infinity
  const pick: number[] = []
  const score = () => {
    const opp = new Map<T, number[]>()
    for (const i of pick) for (const [a, b] of rounds[i]) {
      opp.set(a, [...(opp.get(a) ?? []), strength(b)])
      opp.set(b, [...(opp.get(b) ?? []), strength(a)])
    }
    const means = [...opp.values()].map((xs) => xs.reduce((x, y) => x + y, 0) / xs.length)
    const avg = means.reduce((x, y) => x + y, 0) / Math.max(1, means.length)
    return means.reduce((x, m) => x + (m - avg) ** 2, 0)
  }
  const walk = (from: number) => {
    if (pick.length === want) {
      const sc = score()
      if (sc < bestScore - 1e-9) {
        bestScore = sc
        best = [...pick]
      }
      return
    }
    for (let i = from; i <= rounds.length - (want - pick.length); i++) {
      pick.push(i)
      walk(i + 1)
      pick.pop()
    }
  }
  walk(0)
  return best.map((i) => rounds[i])
}

/**
 * Teamrennen. Passen alle Teams auf die Bahn: alle zusammen. Passen zwei: jedes Team gegen jedes
 * (ein Durchgang = alle Paarungen einmal). Passen mehrere: Gruppen, je Durchgang neu gemischt.
 * Sonst „Positionsduelle“: die Stärksten jedes Teams gegeneinander, dann die Zweiten usw. – ist ein
 * Team kleiner, fährt sein Schwächster doppelt (Joker). Jedes Team bekommt pro Lauf den Schnitt
 * der Punkte seiner Fahrer; alle Mitglieder bekommen die Teampunkte – Zusammenarbeit lohnt sich.
 * Damit es fair bleibt, werden Läufe mit weniger Fahrern auf die größte Laufgröße hochgerechnet
 * und Teams mit weniger Läufen (Pause bei ungerader Teamzahl) auf die meisten Läufe.
 */
function sectionTeam(env: Env, sec: SectionDef, teams: TeamState[], per: number): Omit<SectionState, 'def'> {
  const heats: Heat[] = []
  const members = new Map(teams.map((t) => [t.id, [...t.drivers].sort((a, b) => env.ctx.elo(b) - env.ctx.elo(a) || a.localeCompare(b))]))
  const teamOfAll: Record<string, string> = {}
  for (const t of teams) for (const d of t.drivers) teamOfAll[d] = t.id
  const total = teams.reduce((a, t) => a + t.drivers.length, 0)
  const maxSize = Math.max(0, ...teams.map((t) => t.drivers.length))
  const rounds = sec.rounds ?? 1
  let k = 0
  const add = (ts: TeamState[], entrants: string[], note: string | null) => {
    k++
    const teamOf: Record<string, string> = {}
    for (const n of entrants) teamOf[n] = teamOfAll[n]
    heats.push(addHeat(env, sec, { id: `${sec.id}-${k}`, label: `Teamrennen ${k}`, kind: 'race', entrants: entrants.map(named), teamOf, note: note ?? ts.map((t) => t.name).join(' gegen ') }))
  }
  let plan: TeamPlan
  if (total <= per) {
    plan = { mode: 'all', perRound: 1, halfPossible: false, halfCount: 1 }
    for (let r = 0; r < rounds; r++) add(teams, teams.flatMap((t) => members.get(t.id)!), rounds > 1 ? `Durchgang ${r + 1}` : null)
  } else if (maxSize * 2 <= per && Math.floor(per / maxSize) === 2) {
    const rr = roundRobin(teams)
    const perRound = rr.reduce((a, p) => a + p.length, 0)
    plan = { mode: 'pairs', perRound, halfPossible: rr.length >= 3, halfCount: Math.ceil(rr.length / 2) * (rr[0]?.length ?? 0) }
    const strength = (t: TeamState) => t.drivers.reduce((a, d) => a + env.ctx.elo(d), 0) / t.drivers.length
    const list = plan.halfPossible && sec.half && rounds === 1 ? balancedHalf(rr, strength) : Array.from({ length: rounds }, () => rr).flat()
    list.forEach((pairs, i) => {
      const r = Math.floor(i / rr.length)
      for (const [a, b] of pairs) add([a, b], [...members.get(a.id)!, ...members.get(b.id)!], rounds > 1 ? `${a.name} gegen ${b.name} · Durchgang ${r + 1}` : null)
    })
  } else if (maxSize * 2 <= per) {
    const perHeat = Math.floor(per / maxSize)
    plan = { mode: 'groups', perRound: Math.ceil(teams.length / perHeat), halfPossible: false, halfCount: 0 }
    for (let r = 0; r < rounds; r++) {
      const order = r === 0 ? teams : shuffle(teams, `${env.def.seed}|${sec.id}|${r}`)
      // Ein Team allein wäre kein Rennen: Pause, wird über die Zahl der Läufe ausgeglichen
      for (const g of chunkEven(order, perHeat)) if (g.length > 1) add(g, g.flatMap((t) => members.get(t.id)!), null)
    }
  } else {
    plan = { mode: 'slots', perRound: maxSize * Math.ceil(teams.length / per), halfPossible: false, halfCount: 0 }
    for (let r = 0; r < rounds; r++) {
      for (let slot = 0; slot < maxSize; slot++) {
        // Passen nicht alle Teams in einen Lauf, wird für jede Position neu gemischt – so trifft jedes Team mal auf jedes
        const order = teams.length <= per || (r === 0 && slot === 0) ? teams : shuffle(teams, `${env.def.seed}|${sec.id}|${r}|${slot}`)
        const pick = order.map((t) => {
          const m = members.get(t.id)!
          return { t, driver: m[Math.min(slot, m.length - 1)] }
        })
        for (const g of chunkEven(pick, per)) if (g.length > 1) add(g.map((x) => x.t), g.map((x) => x.driver), g.length === teams.length ? `Die Nr. ${slot + 1} jedes Teams` : `Nr. ${slot + 1}: ${g.map((x) => x.t.name).join(' gegen ')}`)
      }
    }
  }
  // Teampunkte je Lauf: Schnitt der Fahrerpunkte, auf die größte Laufgröße hochgerechnet
  const biggest = Math.max(0, ...heats.map((h) => h.entrants.length))
  const ref = expectedPoints(env, biggest)
  const planned = new Map(teams.map((t) => [t.id, 0]))
  for (const h of heats) for (const t of new Set(Object.values(h.teamOf ?? {}))) planned.set(t, (planned.get(t) ?? 0) + 1)
  const most = Math.max(0, ...planned.values())
  const teamSum = new Map(teams.map((t) => [t.id, 0]))
  for (const h of heats) {
    if (h.status !== 'done') continue
    const byTeam = new Map<string, number[]>()
    for (const [n, p] of h.points) {
      const t = h.teamOf?.[n] ?? teamOfAll[n]
      if (t) byTeam.set(t, [...(byTeam.get(t) ?? []), p])
    }
    const e = expectedPoints(env, h.order.length)
    const scale = e > 0 && ref > 0 ? ref / e : 1
    h.teamPoints = new Map([...byTeam].map(([t, ps]) => [t, Math.round((ps.reduce((a, b) => a + b, 0) / ps.length) * scale * 10) / 10]))
    for (const [t, p] of h.teamPoints) teamSum.set(t, (teamSum.get(t) ?? 0) + p * (most / Math.max(1, planned.get(t) ?? most)))
  }
  const teamRows = [...teamSum].sort((a, b) => b[1] - a[1]).map(([id, points], i) => ({ name: id, rank: i + 1, points: Math.round(points * 10) / 10, detail: teams.find((t) => t.id === id)!.name }))
  const ranking = teams
    .flatMap((t) => t.drivers.map((d) => ({ name: d, points: teamSum.get(t.id) ?? 0, detail: t.name })))
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
    .map((r, i) => ({ ...r, rank: i + 1, points: Math.round(r.points * 10) / 10 }))
  return { heats, ranking, teamRanking: teamRows, started: heats.some((h) => h.status === 'done'), complete: heats.every((h) => h.status === 'done'), teamPlan: plan }
}

function sectionCustom(env: Env, sec: SectionDef, drivers: string[]): Omit<SectionState, 'def'> {
  const heats = (sec.heats ?? []).map((h, k) =>
    addHeat(env, sec, { id: `${sec.id}-${k + 1}`, label: `${h.kind === 'quali' ? 'Quali' : 'Lauf'} ${k + 1}`, kind: h.kind, entrants: h.drivers.map(named) }),
  )
  scaleToBiggest(env, heats)
  return { heats, ranking: rankingFromSums(heats, drivers), teamRanking: null, started: heats.some((h) => h.status === 'done'), complete: heats.every((h) => h.status === 'done') }
}

function sectionFree(env: Env, sec: SectionDef, drivers: string[]): Omit<SectionState, 'def'> {
  const rest = env.sessions.filter((s) => !env.used.has(s.fileId) && !env.ignored.has(s.fileId) && (!env.manualIds.has(s.fileId) || env.def.matches[s.fileId]?.startsWith(`${sec.id}-f-`)))
  const heats = rest.map((s, k) => {
    const kind = isQuali(s) ? 'quali' : 'race'
    return addHeat(env, sec, { id: `${sec.id}-f-${s.fileId}`, label: `${kind === 'quali' ? 'Quali' : 'Lauf'} ${k + 1}`, kind, entrants: driverSet(s).map(named) })
  })
  return { heats, ranking: rankingFromSums(heats, drivers), teamRanking: null, started: heats.length > 0, complete: false }
}

// ---- Wettkampf -------------------------------------------------------------------------------

/** Startreihenfolge eines Abschnitts (beste zuerst) */
function seedsFor(env: Env, sec: SectionDef, prev: SectionState | null, drivers: string[]): Entrant[] {
  const byElo = [...drivers].sort((a, b) => env.ctx.elo(b) - env.ctx.elo(a) || a.localeCompare(b))
  if (sec.seeding === 'random') return shuffle(byElo, `${env.def.seed}|${sec.id}`).map(named)
  if (sec.seeding === 'elo' || !prev) return byElo.map(named)
  if (!prev.complete) return byElo.map((_, i) => placeholder(`Platz ${i + 1} ${prev.def.name}`))
  const fromPrev = prev.ranking.map((r) => r.name).filter((n) => drivers.includes(n))
  // Spontan dazugekommene Fahrer stehen hinten
  return [...fromPrev, ...byElo.filter((n) => !fromPrev.includes(n))].map(named)
}

export function computeEvent(def: EventDef, ctx: EventContext): EventState {
  const sessions = [...ctx.sessions].sort((a, b) => a.date.localeCompare(b.date) || a.createdTime.localeCompare(b.createdTime))
  const drivers = def.drivers.length ? def.drivers : [...new Set(sessions.flatMap(driverSet))]
  const manualFor = new Map<string, Session>()
  const ignored = new Set<string>()
  for (const [fileId, target] of Object.entries(def.matches)) {
    const s = sessions.find((x) => x.fileId === fileId)
    if (!s) continue
    if (target === 'ignore') ignored.add(fileId)
    else manualFor.set(target, s)
  }
  const env: Env = {
    def,
    ctx,
    sessions,
    used: new Set(),
    ignored,
    manualFor,
    manualIds: new Set([...manualFor.values()].map((s) => s.fileId)),
    lastTime: '',
    heatCount: new Map(),
    carBase: new Map(),
    heats: [],
  }
  const { teams, warnings } = buildTeams(def, drivers, ctx.elo)
  const states: (SectionState | null)[] = def.sections.map(() => null)
  let prev: SectionState | null = null
  // „Wie gefahren“-Abschnitte nehmen am Ende alle übrigen Läufe
  const order = [...def.sections.keys()].sort((a, b) => Number(def.sections[a].format === 'free') - Number(def.sections[b].format === 'free'))
  for (const i of order) {
    const sec = def.sections[i]
    // Müssen alle verschiedene Autos aus einer Liste fahren, fahren höchstens so viele gleichzeitig, wie Autos ausgewählt sind
    const cap = carCap(sec.cars ?? def.cars)
    const wanted = Math.max(1, sec.maxPerHeat ?? def.maxPerHeat)
    const per = Math.min(wanted, cap ?? wanted)
    if (cap != null && cap < wanted) warnings.push(`${sec.name}: Nur ${cap} ${cap === 1 ? 'Auto' : 'Autos'} ausgewählt – es fahren höchstens ${cap} gleichzeitig.`)
    let part: Omit<SectionState, 'def'>
    if (sec.format === 'free') part = sectionFree(env, sec, drivers)
    else if (sec.format === 'custom') part = sectionCustom(env, sec, drivers)
    else if (sec.format === 'team') {
      if (!teams.length) warnings.push(`${sec.name}: Teamrennen ohne Teams – bitte Teammodus einschalten.`)
      part = teams.length ? sectionTeam(env, sec, teams, per) : sectionRaces(env, sec, seedsFor(env, sec, prev, drivers), per)
    } else {
      const seeds = seedsFor(env, sec, prev, drivers)
      if (sec.format === 'quali') part = sectionQuali(env, sec, seeds, per)
      else if (sec.format === 'ladder') part = sectionLadder(env, sec, seeds, per)
      else if (sec.format === 'ko') part = sectionKo(env, sec, seeds, per)
      else part = sectionRaces(env, sec, seeds, per)
    }
    const state: SectionState = { def: sec, ...part }
    states[i] = state
    if (sec.format !== 'free') prev = state
  }
  const sections = states as SectionState[]
  const heats = sections.flatMap((s) => s.heats)
  const next = heats.find((h) => h.status === 'ready') ?? null
  if (next) next.status = 'next'

  // ---- Gesamtwertung ----
  const sc = def.scoring
  const lastScoring = sections.map((s, i) => (s.def.weight > 0 && s.def.format !== 'free' ? i : -1)).reduce((a, b) => Math.max(a, b), -1)
  const everyone = [...new Set([...drivers, ...heats.flatMap((h) => h.order)])]
  const rows = new Map<string, Standing>()
  const teamOf = new Map(teams.flatMap((t) => t.drivers.map((d) => [d, t] as const)))
  for (const n of everyone) rows.set(n, { name: n, rank: 0, total: 0, sections: sections.map(() => 0), bonuses: [], races: 0, wins: 0, bestLapMs: null, team: teamOf.get(n)?.name ?? null, teamId: teamOf.get(n)?.id ?? null })
  sections.forEach((s, i) => {
    const factor = s.def.weight * (i === lastScoring ? sc.finaleFactor : 1)
    for (const r of s.ranking) {
      const row = rows.get(r.name)
      if (row && s.started) row.sections[i] = Math.round(r.points * factor * 10) / 10
    }
  })
  // Kennzahlen und Erwartung (nur Rennen)
  const over = new Map<string, number>()
  let fastest: EventState['fastestLap'] = null
  const eventBest = new Map<string, number>()
  for (const h of heats) {
    if (h.status !== 'done' || !h.session) continue
    const driven = new Map(h.session.results.map((r) => [r.driver, r]))
    for (const n of h.order) {
      const res = driven.get(n)
      const ms = res?.validBestLapMs ?? null
      if (ms != null && ms < (eventBest.get(n) ?? Infinity)) eventBest.set(n, ms)
      const row = rows.get(n)
      if (!row) continue
      if (ms != null && (row.bestLapMs == null || ms < row.bestLapMs)) row.bestLapMs = ms
      if (h.kind !== 'race') continue
      row.races++
      if (h.order[0] === n && h.order.length > 1) row.wins++
      if (ms != null && (!fastest || ms < fastest.ms)) fastest = { name: n, ms, car: res?.car ?? '' }
      if (sc.clean && res && res.laps >= 3 && !res.lapTimes.some((l) => l.status === 'crash')) row.bonuses.push({ kind: 'clean', label: `Ohne Abflug · ${h.label}`, points: sc.clean })
    }
    if (h.kind === 'race' && h.order.length > 1) {
      const str = (n: string) => strengthOf(env, n, driven.get(n)?.car)
      h.order.forEach((n, i) => {
        let expected = 0
        for (const o of h.order) if (o !== n) expected += winProb(str(n), str(o))
        over.set(n, (over.get(n) ?? 0) + (h.order.length - 1 - i) - expected)
      })
    }
  }
  const started = heats.some((h) => h.status === 'done')
  const planned = heats.filter((h) => h.sectionId && def.sections.find((s) => s.id === h.sectionId)?.format !== 'free')
  const complete = planned.length > 0 && planned.every((h) => h.status === 'done')
  if (fastest && sc.fastestLap) rows.get(fastest.name)?.bonuses.push({ kind: 'fastestLap', label: 'Schnellste Runde', points: sc.fastestLap })
  const quali = sections.find((s) => s.def.format === 'quali')
  if (quali?.complete && quali.ranking[0] && sc.pole) rows.get(quali.ranking[0].name)?.bonuses.push({ kind: 'pole', label: 'Pole', points: sc.pole })
  const dotd = [...over].filter(([n]) => (rows.get(n)?.races ?? 0) >= 2).sort((a, b) => b[1] - a[1])[0]
  if (dotd && dotd[1] > 0.5 && sc.driverOfDay) rows.get(dotd[0])?.bonuses.push({ kind: 'driverOfDay', label: 'Fahrer des Tages', points: sc.driverOfDay })
  if (sc.personalBest) {
    for (const [n, ms] of eventBest) {
      const before = ctx.previousBest(n)
      if (before != null && ms < before) rows.get(n)?.bonuses.push({ kind: 'personalBest', label: 'Neue persönliche Bestzeit', points: sc.personalBest })
    }
  }
  for (const row of rows.values()) row.total = Math.round((row.sections.reduce((a, b) => a + b, 0) + row.bonuses.reduce((a, b) => a + b.points, 0)) * 10) / 10
  const last = lastScoring >= 0 ? sections[lastScoring] : null
  const lastRank = (n: string) => last?.ranking.find((r) => r.name === n)?.rank ?? 999
  const standings = [...rows.values()].sort((a, b) => b.total - a.total || lastRank(a.name) - lastRank(b.name) || b.wins - a.wins || a.name.localeCompare(b.name))
  standings.forEach((s, i) => (s.rank = i > 0 && standings[i - 1].total === s.total && lastRank(standings[i - 1].name) === lastRank(s.name) ? standings[i - 1].rank : i + 1))

  const teamStandings: TeamStanding[] = teams
    .map((t) => {
      const pts = t.drivers.map((d) => rows.get(d)?.total ?? 0)
      return { id: t.id, name: t.name, drivers: t.drivers, elo: t.elo, rank: 0, points: pts.length ? Math.round((pts.reduce((a, b) => a + b, 0) / pts.length) * 10) / 10 : 0 }
    })
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
  teamStandings.forEach((t, i) => (t.rank = i > 0 && teamStandings[i - 1].points === t.points ? teamStandings[i - 1].rank : i + 1))

  const unmatched = sessions.filter((s) => !env.used.has(s.fileId) && !ignored.has(s.fileId))
  if (unmatched.length) warnings.push(`${unmatched.length === 1 ? 'Eine Datei passt' : `${unmatched.length} Dateien passen`} zu keinem Lauf – im Editor zuordnen.`)
  return {
    def,
    drivers,
    teams,
    sections,
    heats,
    standings,
    teamStandings,
    next,
    unmatched,
    started,
    complete,
    overperformance: over,
    fastestLap: fastest,
    warnings,
  }
}
