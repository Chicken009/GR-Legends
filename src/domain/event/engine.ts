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

export interface SectionState {
  def: SectionDef
  heats: Heat[]
  ranking: RankRow[]
  teamRanking: RankRow[] | null
  started: boolean
  complete: boolean
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
}

export interface TeamState {
  id: string
  name: string
  drivers: string[]
}

export interface TeamStanding {
  id: string
  name: string
  drivers: string[]
  rank: number
  /** Schnitt der Gesamtpunkte der Mitglieder */
  points: number
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
    return { teams: teams.filter((t) => t.drivers.length), warnings }
  }
  const count = Math.max(1, Math.floor(drivers.length / Math.max(1, rule.size)))
  const ordered = rule.mode === 'random' ? shuffle(drivers, `${def.seed}|teams`) : [...drivers].sort((a, b) => elo(b) - elo(a) || a.localeCompare(b))
  const groups = rule.mode === 'random' ? ordered.reduce<string[][]>((g, d, i) => (g[i % count].push(d), g), Array.from({ length: count }, () => [])) : snake(ordered, count)
  const names = rule.teams.map((t) => t.name)
  return { teams: groups.map((g, i) => ({ id: `t${i + 1}`, name: names[i] || `Team ${i + 1}`, drivers: g })).filter((t) => t.drivers.length), warnings }
}

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
    teamOf: init.teamOf ?? null,
    note: init.note ?? null,
    session: null,
    manual: false,
    status: entrants.length && names.length === entrants.length ? 'ready' : 'waiting',
    order: [],
    points: new Map(),
    teamPoints: null,
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

function sectionRaces(env: Env, sec: SectionDef, seeds: Entrant[], per: number): Omit<SectionState, 'def'> {
  const rounds = sec.rounds ?? 1
  const heats: Heat[] = []
  const count = Math.max(1, Math.ceil(seeds.length / per))
  let k = 0
  for (let r = 0; r < rounds; r++) {
    // Erster Durchgang: ausgeglichene Gruppen nach Startreihenfolge, danach neu gemischt
    const list = r === 0 ? seeds : shuffle(seeds, `${env.def.seed}|${sec.id}|${r}`)
    for (const g of snake(list, count)) {
      if (!g.length) continue
      k++
      heats.push(addHeat(env, sec, { id: `${sec.id}-r${r + 1}-${k}`, label: `Rennen ${k}`, kind: 'race', entrants: g, note: rounds > 1 ? `Durchgang ${r + 1} von ${rounds}` : null }))
    }
  }
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

function sectionLadder(env: Env, sec: SectionDef, seeds: Entrant[], per: number): Omit<SectionState, 'def'> {
  if (!seeds.length) return { heats: [], ranking: [], teamRanking: null, started: false, complete: false }
  const advance = Math.min(sec.advance ?? 2, per - 1)
  const sizes = ladderSizes(seeds.length, per, advance)
  const heats: Heat[] = []
  // Setzliste: beste zuerst – unten fahren die letzten
  let rest = [...seeds]
  const direct: Entrant[][] = []
  for (let i = sizes.length - 1; i >= 0; i--) {
    direct[i] = rest.slice(0, sizes[i])
    rest = rest.slice(sizes[i])
  }
  // Ausscheiden: Ebene und Platz im Lauf
  const exit = new Map<string, { level: number; pos: number }>()
  let carry: Entrant[] = []
  for (let level = 0; level < sizes.length; level++) {
    const top = level === sizes.length - 1
    const label = top && sizes.length > 1 ? 'Finale' : `Rennen ${level + 1}`
    const entrants = [...carry, ...direct[level]]
    const heat = addHeat(env, sec, {
      id: `${sec.id}-L${level + 1}`,
      label,
      kind: 'race',
      entrants,
      note: top ? 'Entscheidet den Sieg' : `Top ${advance} steigen auf`,
    })
    heats.push(heat)
    if (heat.status === 'done') {
      heat.order.forEach((n, i) => exit.set(n, { level, pos: i }))
      carry = heat.order.slice(0, top ? 0 : advance).map(named)
    } else {
      for (const e of heat.entrants) if (e.name) exit.set(e.name, { level, pos: 100 + seeds.findIndex((s) => s.name === e.name) })
      carry = Array.from({ length: advance }, (_, i) => placeholder(`Platz ${i + 1} aus ${label}`))
    }
  }
  const names = [...exit.keys()]
  const ordered = names.sort((a, b) => exit.get(b)!.level - exit.get(a)!.level || exit.get(a)!.pos - exit.get(b)!.pos)
  const complete = heats.every((h) => h.status === 'done')
  return {
    heats,
    ranking: rankingFromOrder(env, ordered, (n) => {
      const e = exit.get(n)!
      const h = heats[e.level]
      return e.pos >= 100 ? `startet in ${h.label}` : `${h.label} P${e.pos + 1}`
    }),
    teamRanking: null,
    started: heats.some((h) => h.status === 'done'),
    complete,
  }
}

function sectionKo(env: Env, sec: SectionDef, seeds: Entrant[], per: number): Omit<SectionState, 'def'> {
  if (!seeds.length) return { heats: [], ranking: [], teamRanking: null, started: false, complete: false }
  const advance = Math.min(sec.advance ?? 1, per - 1)
  const heats: Heat[] = []
  const exit = new Map<string, { level: number; pos: number }>()
  let field = [...seeds]
  let level = 0
  while (field.length) {
    const final = field.length <= per
    const count = final ? 1 : Math.ceil(field.length / per)
    const groups = snake(field, count).filter((g) => g.length)
    const nextCount = final ? 0 : groups.reduce((a, g) => a + Math.min(advance, g.length - 1), 0)
    const semi = !final && nextCount <= per
    const next: Entrant[] = []
    groups.forEach((g, k) => {
      const label = final ? 'Finale' : semi ? `Halbfinale ${k + 1}` : `Runde ${level + 1} · Lauf ${k + 1}`
      const adv = Math.min(advance, g.length - 1)
      const heat = addHeat(env, sec, { id: `${sec.id}-r${level + 1}-${k + 1}`, label: groups.length === 1 && !final ? `Runde ${level + 1}` : label, kind: 'race', entrants: g, note: final ? 'Entscheidet den Sieg' : `Top ${adv} kommen weiter` })
      heats.push(heat)
      if (heat.status === 'done') {
        heat.order.forEach((n, i) => exit.set(n, { level, pos: i }))
        next.push(...heat.order.slice(0, final ? 0 : adv).map(named))
      } else {
        for (const e of heat.entrants) if (e.name) exit.set(e.name, { level, pos: 100 + seeds.findIndex((s) => s.name === e.name) })
        if (!final) next.push(...Array.from({ length: adv }, (_, i) => placeholder(`Platz ${i + 1} aus ${heat.label}`)))
      }
    })
    if (final || next.length >= field.length) break
    field = next
    level++
  }
  const ordered = [...exit.keys()].sort((a, b) => exit.get(b)!.level - exit.get(a)!.level || exit.get(a)!.pos - exit.get(b)!.pos)
  return {
    heats,
    ranking: rankingFromOrder(env, ordered, (n) => {
      const e = exit.get(n)!
      const h = heats.find((x) => x.entrants.some((en) => en.name === n) && x.id.includes(`-r${e.level + 1}-`))
      return e.pos >= 100 ? `startet in ${h?.label ?? 'Runde 1'}` : `${h?.label ?? ''} P${e.pos + 1}`
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
 * Teamrennen. Passen alle Teams auf die Bahn: alle zusammen. Passen zwei: jedes Team gegen jedes.
 * Sonst „Positionsduelle“: die Stärksten jedes Teams gegeneinander, dann die Zweiten usw. – ist ein
 * Team kleiner, fährt sein Schwächster doppelt (Joker). Jedes Team bekommt pro Lauf den Schnitt
 * der Punkte seiner Fahrer; alle Mitglieder bekommen die Teampunkte – Zusammenarbeit lohnt sich.
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
  if (total <= per) {
    for (let r = 0; r < rounds; r++) add(teams, teams.flatMap((t) => members.get(t.id)!), rounds > 1 ? `Durchgang ${r + 1}` : null)
  } else if (maxSize * 2 <= per) {
    const perHeat = Math.max(2, Math.floor(per / maxSize))
    if (perHeat === 2) {
      const rr = roundRobin(teams)
      const list = sec.rounds ? rr.slice(0, sec.rounds) : rr
      for (const pairs of list) for (const [a, b] of pairs) add([a, b], [...members.get(a.id)!, ...members.get(b.id)!], null)
    } else {
      for (let r = 0; r < rounds; r++) {
        const order = r === 0 ? teams : shuffle(teams, `${env.def.seed}|${sec.id}|${r}`)
        for (const g of chunkEven(order, perHeat)) add(g, g.flatMap((t) => members.get(t.id)!), null)
      }
    }
  } else {
    for (let r = 0; r < rounds; r++) {
      for (let slot = 0; slot < maxSize; slot++) {
        const pick = teams.map((t) => {
          const m = members.get(t.id)!
          return { t, driver: m[Math.min(slot, m.length - 1)] }
        })
        for (const g of chunkEven(pick, per)) add(g.map((x) => x.t), g.map((x) => x.driver), g.length === teams.length ? `Die Nr. ${slot + 1} jedes Teams` : `Nr. ${slot + 1}: ${g.map((x) => x.t.name).join(' gegen ')}`)
      }
    }
  }
  // Teampunkte je Lauf: Schnitt der Fahrerpunkte
  const teamSum = new Map(teams.map((t) => [t.id, 0]))
  for (const h of heats) {
    if (h.status !== 'done') continue
    const byTeam = new Map<string, number[]>()
    for (const [n, p] of h.points) {
      const t = h.teamOf?.[n] ?? teamOfAll[n]
      if (t) byTeam.set(t, [...(byTeam.get(t) ?? []), p])
    }
    h.teamPoints = new Map([...byTeam].map(([t, ps]) => [t, Math.round((ps.reduce((a, b) => a + b, 0) / ps.length) * 10) / 10]))
    for (const [t, p] of h.teamPoints) teamSum.set(t, (teamSum.get(t) ?? 0) + p)
  }
  const teamRows = [...teamSum].sort((a, b) => b[1] - a[1]).map(([id, points], i) => ({ name: id, rank: i + 1, points: Math.round(points * 10) / 10, detail: teams.find((t) => t.id === id)!.name }))
  const ranking = teams
    .flatMap((t) => t.drivers.map((d) => ({ name: d, points: teamSum.get(t.id) ?? 0, detail: t.name })))
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
    .map((r, i) => ({ ...r, rank: i + 1, points: Math.round(r.points * 10) / 10 }))
  return { heats, ranking, teamRanking: teamRows, started: heats.some((h) => h.status === 'done'), complete: heats.every((h) => h.status === 'done') }
}

function sectionCustom(env: Env, sec: SectionDef, drivers: string[]): Omit<SectionState, 'def'> {
  const heats = (sec.heats ?? []).map((h, k) =>
    addHeat(env, sec, { id: `${sec.id}-${k + 1}`, label: `${h.kind === 'quali' ? 'Quali' : 'Lauf'} ${k + 1}`, kind: h.kind, entrants: h.drivers.map(named) }),
  )
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
    const per = Math.max(1, sec.maxPerHeat ?? def.maxPerHeat)
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
  const teamName = new Map(teams.flatMap((t) => t.drivers.map((d) => [d, t.name] as const)))
  for (const n of everyone) rows.set(n, { name: n, rank: 0, total: 0, sections: sections.map(() => 0), bonuses: [], races: 0, wins: 0, bestLapMs: null, team: teamName.get(n) ?? null })
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
      return { id: t.id, name: t.name, drivers: t.drivers, rank: 0, points: pts.length ? Math.round((pts.reduce((a, b) => a + b, 0) / pts.length) * 10) / 10 : 0 }
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
