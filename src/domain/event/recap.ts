import type { Result } from '../../types'
import { isGuest } from '../drivers'
import type { EventState, Heat } from './engine'
import type { ProgressStep, RecapFacts } from './progress'
import { seededRandom, shuffle } from './random'

/**
 * Bausteine für den Wettkampf-Rückblick: Rennwiedergabe aus den Rundenzeiten, Fotofinish,
 * Auszeichnungen ohne Punkte, Quiz und Schlagzeile. Alles nur Anzeige – an der Wertung ändert sich nichts.
 */

const fmtSec = (ms: number, digits = 3) => `${(ms / 1000).toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits })} s`
const median = (v: number[]) => {
  if (!v.length) return null
  const s = [...v].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

const raced = (state: EventState) => state.heats.filter((h) => h.status === 'done' && h.kind === 'race' && h.session)
const resultsOf = (h: Heat) => (h.session?.results ?? []).filter((r) => !isGuest(r.driver) && h.order.includes(r.driver))

// ---- Rennwiedergabe -------------------------------------------------------------------------

export interface ReplayDriver {
  name: string
  car: string
  /** Zeit am Ende jeder Runde (ms seit dem Start) */
  cum: number[]
  /** Runden (Index ab 0) mit Abflug */
  crashes: Set<number>
  /** Platz im Ziel */
  finish: number
}

export interface Replay {
  drivers: ReplayDriver[]
  /** Meiste Runden eines Fahrers */
  laps: number
  /** Bis der Letzte im Ziel ist */
  durationMs: number
}

/** Rennen aus den Rundenzeiten nachstellen; null ohne Rundenzeiten */
export function heatReplay(heat: Heat): Replay | null {
  const rows = resultsOf(heat)
  if (rows.length < 2 || rows.some((r) => !r.lapTimes.length)) return null
  const drivers = rows.map((r: Result) => {
    let t = 0
    const cum = r.lapTimes.map((l) => (t += l.ms))
    const crashes = new Set(r.lapTimes.flatMap((l, i) => (l.status === 'crash' ? [i] : [])))
    return { name: r.driver, car: r.car, cum, crashes, finish: heat.order.indexOf(r.driver) + 1 }
  })
  return { drivers, laps: Math.max(...drivers.map((d) => d.cum.length)), durationMs: Math.max(...drivers.map((d) => d.cum[d.cum.length - 1])) }
}

/** Gefahrene Runden (mit Bruchteil) eines Fahrers zur Zeit t */
export function progressAt(d: ReplayDriver, t: number): number {
  const c = d.cum
  if (t >= c[c.length - 1]) return c.length
  let i = 0
  while (c[i] <= t) i++
  const from = i ? c[i - 1] : 0
  return i + (t - from) / Math.max(1, c[i] - from)
}

/** Stand zur Zeit t: Plätze nach Fortschritt, wer im Ziel ist, nach Zielplatz */
export function replayAt(r: Replay, t: number): { name: string; progress: number; rank: number; crash: boolean; done: boolean }[] {
  const rows = r.drivers.map((d) => {
    const progress = progressAt(d, t)
    const done = progress >= d.cum.length
    return { name: d.name, progress, done, crash: !done && d.crashes.has(Math.floor(progress)), finish: d.finish }
  })
  const order = [...rows].sort((a, b) => (a.done && b.done ? a.finish - b.finish : b.progress - a.progress || a.finish - b.finish))
  return rows.map(({ finish: _f, ...x }) => ({ ...x, rank: order.findIndex((o) => o.name === x.name) + 1 }))
}

/** Reihenfolge nach jeder Runde (wer die Runde noch nicht beendet hat, dahinter) */
function lapOrders(r: Replay): string[][] {
  const out: string[][] = []
  for (let k = 0; k < r.laps; k++) {
    out.push(
      [...r.drivers]
        .sort((a, b) => {
          const ta = a.cum[k] ?? Infinity
          const tb = b.cum[k] ?? Infinity
          return ta - tb || a.finish - b.finish
        })
        .map((d) => d.name),
    )
  }
  return out
}

/** Positionswechsel im Rennen: wie oft zwei Fahrer von einer Runde zur nächsten die Plätze getauscht haben */
export function positionChanges(r: Replay): number {
  const orders = lapOrders(r)
  let n = 0
  for (let k = 1; k < orders.length; k++) {
    const before = new Map(orders[k - 1].map((name, i) => [name, i]))
    const now = orders[k]
    for (let i = 0; i < now.length; i++) for (let j = i + 1; j < now.length; j++) if (before.get(now[i])! > before.get(now[j])!) n++
  }
  return n
}

/** Rennen des Tages: das Rennen mit den meisten Positionswechseln (mindestens 2) */
export function raceOfDay(state: EventState): { heat: Heat; replay: Replay; changes: number; leadChanges: number } | null {
  let best: { heat: Heat; replay: Replay; changes: number; leadChanges: number; gap: number } | null = null
  for (const h of raced(state)) {
    const replay = heatReplay(h)
    if (!replay || replay.laps < 3) continue
    const changes = positionChanges(replay)
    const orders = lapOrders(replay)
    const leadChanges = orders.reduce((n, o, i) => n + (i > 0 && o[0] !== orders[i - 1][0] ? 1 : 0), 0)
    const second = h.session!.results.find((x) => x.driver === h.order[1])
    const gap = second?.gap.kind === 'time' ? second.gap.ms : Infinity
    if (changes >= 2 && (!best || changes > best.changes || (changes === best.changes && gap < best.gap))) best = { heat: h, replay, changes, leadChanges, gap }
  }
  return best && { heat: best.heat, replay: best.replay, changes: best.changes, leadChanges: best.leadChanges }
}

// ---- Rennen um die Spitze --------------------------------------------------------------------

export interface StandingsFrame {
  name: string
  /** Weg bis zur Ziellinie, 0–1 */
  x: number
  rank: number
  /** Zeile in der Rangliste (Kommazahl beim Gleiten); bei Gleichstand eigene Zeilen, nie übereinander */
  pos: number
  points: number
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

/**
 * Das Rennen um die Spitze als Animation: Stand zwischen zwei Etappen bei Fortschritt p (0–1). Mit
 * Punkten fährt jeder so weit, wie er Punkte hat (der Sieger erreicht am Ende die Ziellinie), sonst
 * nach Platz. Gleichstand: gleicher Platz, aber getrennte Zeilen in der Reihenfolge davor.
 */
export function standingsRace(path: ProgressStep[], names: string[], byPoints: boolean): (p: number) => StandingsFrame[] {
  const m = path.length - 1
  const n = names.length
  const maxPts = Math.max(0, ...[...path[m].totals.values()])
  const usePoints = byPoints && maxPts > 0
  const rankAt = (k: number, x: string) => path[k].ranks.get(x) ?? n
  // Zeilen je Etappe: nach Platz, bei Gleichstand bleibt die Reihenfolge der Etappe davor (sort ist stabil)
  const slots: Map<string, number>[] = []
  let prev = [...names]
  path.forEach((_, k) => {
    const order = k === 0 ? prev : [...prev].sort((a, b) => rankAt(k, a) - rankAt(k, b))
    slots.push(new Map(order.map((x, i) => [x, i + 1])))
    prev = order
  })
  return (p) => {
    const u = Math.min(m, Math.max(0, p) * m)
    const k = Math.min(m - 1, Math.floor(u))
    const move = p >= 1 ? 1 : easeInOut(Math.min(1, (u - k) / 0.7))
    return names.map((x) => {
      const t0 = path[k].totals.get(x) ?? 0
      const t1 = path[k + 1].totals.get(x) ?? t0
      // Am Start (alle gleich) steht schon der Platz nach dem ersten Lauf dran, sobald es losgeht
      const r0 = k === 0 ? rankAt(1, x) : rankAt(k, x)
      const r1 = rankAt(k + 1, x)
      const rank = k === 0 && move < 0.5 ? 1 : move < 0.5 ? r0 : r1
      const points = t0 + (t1 - t0) * move
      const s0 = slots[k].get(x)!
      const s1 = slots[k + 1].get(x)!
      const x01 = usePoints ? Math.max(0, points) / maxPts : ((k + move) / m) * (1 - ((rank - 1) / Math.max(1, n)) * 0.6)
      return { name: x, x: x01, rank, pos: s0 + (s1 - s0) * move, points: Math.round(points * 10) / 10 }
    })
  }
}

// ---- Knappe Entscheidungen ------------------------------------------------------------------

export interface CloseFinish {
  heat: Heat
  ms: number
  first: string
  second: string
  /** Abstand im Ziel auf der Strecke (cm), wenn die Streckenlänge bekannt ist */
  cm: number | null
  /** Abstand (ms) nach jeder Runde, positiv = Sieger vorn */
  gaps: number[]
}

/** Die knappsten Zieleinläufe (Platz 1 gegen 2, unter 3 s), knappster zuerst */
export function closeFinishes(state: EventState, count = 3): CloseFinish[] {
  const out: CloseFinish[] = []
  for (const h of raced(state)) {
    if (h.order.length < 2) continue
    const [first, second] = h.order
    const res = h.session!.results
    const b = res.find((r) => r.driver === second)
    const a = res.find((r) => r.driver === first)
    if (b?.gap.kind !== 'time' || b.gap.ms <= 0 || b.gap.ms >= 3000 || !a) continue
    const ms = b.gap.ms
    // Tempo des Zweiten: Streckenlänge durch seine typische saubere Runde
    const lap = median(b.lapTimes.filter((l) => l.status === 'normal').map((l) => l.ms))
    const cm = h.session!.trackLengthCm && lap ? (h.session!.trackLengthCm * ms) / lap : null
    const gaps: number[] = []
    let ta = 0
    let tb = 0
    for (let k = 0; k < Math.min(a.lapTimes.length, b.lapTimes.length); k++) {
      ta += a.lapTimes[k].ms
      tb += b.lapTimes[k].ms
      gaps.push(tb - ta)
    }
    out.push({ heat: h, ms, first, second, cm, gaps })
  }
  return out.sort((x, y) => x.ms - y.ms).slice(0, count)
}

// ---- Runden ---------------------------------------------------------------------------------

export interface FastLap {
  name: string
  ms: number
  car: string
  heat: Heat
  /** Runde im Lauf (ab 1), wenn sie sich finden lässt */
  lap: number | null
}

/** Beste Rennrunde jedes Fahrers im Wettkampf, schnellste zuerst */
export function fastestLaps(state: EventState): FastLap[] {
  const best = new Map<string, FastLap>()
  for (const h of raced(state)) {
    for (const r of resultsOf(h)) {
      const ms = r.validBestLapMs
      if (ms == null || ms >= (best.get(r.driver)?.ms ?? Infinity)) continue
      const i = r.lapTimes.findIndex((l) => l.ms === ms && l.status === 'normal')
      best.set(r.driver, { name: r.driver, ms, car: r.car, heat: h, lap: i >= 0 ? i + 1 : null })
    }
  }
  return [...best.values()].sort((a, b) => a.ms - b.ms || a.name.localeCompare(b.name))
}

/** Teuerster Abflug: größter Zeitverlust einer Runde mit Abflug, und wie viele Plätze er wohl gekostet hat */
export function costliestCrash(state: EventState): { name: string; heat: Heat; lap: number; lossMs: number; places: number; lapTimes: { ms: number; crash: boolean }[] } | null {
  let best: { name: string; heat: Heat; lap: number; lossMs: number; places: number; lapTimes: { ms: number; crash: boolean }[] } | null = null
  for (const h of raced(state)) {
    const res = resultsOf(h)
    const gapOf = (r: Result) => (r.gap.kind === 'leader' ? 0 : r.gap.kind === 'time' ? r.gap.ms : null)
    for (const r of res) {
      r.lapTimes.forEach((l, i) => {
        if (l.status !== 'crash' || !l.lossMs || l.lossMs < 1000 || (best && l.lossMs <= best.lossMs)) return
        // Plätze: wer vor ihm im Ziel war, aber weniger Vorsprung hatte als der Verlust
        const own = gapOf(r)
        const places = own == null ? 0 : res.filter((o) => o.position < r.position && gapOf(o) != null && own - gapOf(o)! < l.lossMs!).length
        best = { name: r.driver, heat: h, lap: i + 1, lossMs: l.lossMs, places, lapTimes: r.lapTimes.map((x) => ({ ms: x.ms, crash: x.status === 'crash' })) }
      })
    }
  }
  return best
}

// ---- Auszeichnungen ohne Punkte ---------------------------------------------------------------

/** Der Konstante: kleinste Streuung der sauberen Runden (je Rennen, ohne erste Runde), mindestens 10 Runden */
export function mostConsistent(state: EventState): { name: string; spreadMs: number } | null {
  const acc = new Map<string, { sum: number; n: number }>()
  for (const h of raced(state)) {
    for (const r of resultsOf(h)) {
      const laps = r.lapTimes.slice(1).filter((l) => l.status === 'normal').map((l) => l.ms)
      if (laps.length < 3) continue
      const mean = laps.reduce((a, b) => a + b, 0) / laps.length
      const sd = Math.sqrt(laps.reduce((a, b) => a + (b - mean) ** 2, 0) / laps.length)
      const x = acc.get(r.driver) ?? { sum: 0, n: 0 }
      x.sum += sd * laps.length
      x.n += laps.length
      acc.set(r.driver, x)
    }
  }
  const rows = [...acc].filter(([, v]) => v.n >= 10).map(([name, v]) => ({ name, spreadMs: v.sum / v.n })).sort((a, b) => a.spreadMs - b.spreadMs)
  return rows.length >= 3 && rows[0].spreadMs < rows[1].spreadMs ? rows[0] : null
}

/** Überholkönig: meiste gewonnene Plätze von Runde 1 bis ins Ziel (alle Rennen zusammen, mindestens 3) */
export function mostGained(state: EventState): { name: string; places: number } | null {
  const sum = new Map<string, number>()
  for (const h of raced(state)) {
    const r = heatReplay(h)
    if (!r) continue
    const first = lapOrders(r)[0]
    for (const d of r.drivers) sum.set(d.name, (sum.get(d.name) ?? 0) + first.indexOf(d.name) + 1 - d.finish)
  }
  const rows = [...sum].sort((a, b) => b[1] - a[1])
  return rows[0] && rows[0][1] >= 3 && (rows[1]?.[1] ?? 0) < rows[0][1] ? { name: rows[0][0], places: rows[0][1] } : null
}

/** Kilometerfresser: die meisten Runden (allein vorn) */
export function mostLaps(perDriver: { name: string; laps: number }[]): { name: string; laps: number } | null {
  const [a, b] = perDriver
  return a && b && a.laps > b.laps ? a : null
}

// ---- Rivale ----------------------------------------------------------------------------------

/** Dein Rivale: mit wem man am öftesten im selben Rennen saß (mindestens 2), mit Bilanz */
export function rivalOf(state: EventState, me: string): { name: string; wins: number; losses: number; races: boolean[] } | null {
  const duels = new Map<string, boolean[]>()
  for (const h of raced(state)) {
    const mine = h.order.indexOf(me)
    if (mine < 0) continue
    h.order.forEach((o, i) => {
      if (o !== me) duels.set(o, [...(duels.get(o) ?? []), mine < i])
    })
  }
  const rows = [...duels]
    .filter(([, v]) => v.length >= 2)
    .map(([name, races]) => ({ name, races, wins: races.filter(Boolean).length, losses: races.filter((x) => !x).length }))
    .sort((a, b) => b.races.length - a.races.length || Math.abs(a.wins - a.losses) - Math.abs(b.wins - b.losses) || a.name.localeCompare(b.name))
  return rows[0] ?? null
}

// ---- Zahlen ---------------------------------------------------------------------------------

/** Weitere Zahlen: reine Fahrzeit (Summe der Läufe), Boxenstopps, verschiedene Autos */
export function moreNumbers(state: EventState): { driveMs: number | null; pitStops: number; cars: number } {
  const done = state.heats.filter((h) => h.status === 'done' && h.session)
  const durations = done.map((h) => {
    const rows = h.session!.results.filter((r) => r.lapTimes.length)
    return rows.length ? Math.max(...rows.map((r) => r.lapTimes.reduce((a, l) => a + l.ms, 0))) : null
  })
  const results = done.flatMap((h) => h.session!.results.filter((r) => !isGuest(r.driver)))
  return {
    driveMs: durations.length && durations.every((d) => d != null) ? durations.reduce((a, b) => a! + b!, 0) : null,
    pitStops: results.reduce((a, r) => a + r.pitStops, 0),
    cars: new Set(results.map((r) => r.car).filter(Boolean)).size,
  }
}

/** Vergleich für die Fahrzeit – nur, wenn er sich anbietet (mindestens anderthalb Fußballspiele) */
export function driveTimeFun(ms: number): string | null {
  const games = ms / (90 * 60_000)
  if (games < 1.5) return null
  const n = Math.round(games * 2) / 2
  return `so lang wie ${n.toLocaleString('de-DE')} Fußballspiele`
}

// ---- Quiz ------------------------------------------------------------------------------------

export interface QuizQuestion {
  question: string
  options: string[]
  answer: number
  /** Kurzer Satz nach dem Auflösen */
  reveal: string
  /** Antworten sind Fahrer (Avatare zeigen) */
  drivers: boolean
}

/**
 * Quizfragen zum Wettkampf, je mit drei Antworten. Nur Fragen mit eindeutiger Antwort, die den Sieger
 * nicht verraten. `seed` mischt Fragen und falsche Antworten.
 */
export function quizQuestions(state: EventState, f: RecapFacts, perDriver: { name: string; laps: number; crashes: number }[], seed: string, max = 4): QuizQuestion[] {
  const rnd = seededRandom(seed)
  const people = state.standings.filter((s) => s.races > 0).map((s) => s.name)
  if (people.length < 3) return []
  const pick = (answer: string, near: string[] = []) => {
    const pool = shuffle(people.filter((p) => p !== answer && !near.includes(p)), `${seed}|${answer}`)
    const wrong = [...near.filter((n) => n !== answer && people.includes(n)), ...pool].slice(0, 2)
    const options = shuffle([answer, ...wrong], `${seed}|o|${answer}`)
    return { options, answer: options.indexOf(answer) }
  }
  const out: QuizQuestion[] = []
  const laps = fastestLaps(state)
  if (state.fastestLap) {
    const near = laps.filter((l) => l.name !== state.fastestLap!.name).slice(0, 2).map((l) => l.name)
    out.push({ question: 'Wer fuhr die schnellste Runde?', ...pick(state.fastestLap.name, near), reveal: `${state.fastestLap.name} mit ${fmtSec(state.fastestLap.ms)}.`, drivers: true })
  }
  const crashes = [...perDriver].sort((a, b) => b.crashes - a.crashes)
  if (crashes[0] && crashes[0].crashes >= 2 && crashes[0].crashes > (crashes[1]?.crashes ?? 0)) {
    out.push({ question: 'Wer flog am häufigsten ab?', ...pick(crashes[0].name), reveal: `${crashes[0].name} – ${crashes[0].crashes}-mal.`, drivers: true })
  }
  const most = mostLaps(perDriver)
  if (most) out.push({ question: 'Wer fuhr die meisten Runden?', ...pick(most.name), reveal: `${most.name} mit ${most.laps} Runden.`, drivers: true })
  if (f.closest) {
    const c = f.closest
    out.push({ question: `Wer gewann das knappste Rennen (${c.heat.label})?`, ...pick(c.heat.order[0], [c.heat.order[1]]), reveal: `${c.heat.order[0]} – ${fmtSec(c.ms)} vor ${c.heat.order[1]}.`, drivers: true })
  }
  if (f.leaders.length >= 3 && !f.wireToWire) {
    const n = f.leadChanges
    const opts = [...new Set([n, n + 1 + Math.floor(rnd() * 2), Math.max(0, n - 1 - Math.floor(rnd() * 2)), n + 3])].filter((x) => x >= 0).slice(0, 3)
    const options = shuffle(opts.map(String), `${seed}|lead`)
    out.push({ question: 'Wie oft wechselte die Führung?', options, answer: options.indexOf(String(n)), reveal: `${n}-mal.`, drivers: false })
  }
  return shuffle(out, `${seed}|q`).slice(0, max)
}

// ---- Schlagzeile ----------------------------------------------------------------------------

export interface Headline {
  title: string
  chips: string[]
}

/** Schlagzeile zum Schluss: für einen Fahrer persönlich, sonst die stärkste Geschichte des Wettkampfs */
export function headline(state: EventState, steps: ProgressStep[], f: RecapFacts, me: string | null, done: boolean): Headline {
  const fl = state.fastestLap
  const mine = me ? state.standings.find((s) => s.name === me) : null
  if (me && mine) {
    const ranks = steps.slice(1).map((s) => s.ranks.get(me)).filter((r): r is number => r != null)
    const worst = ranks.length >= 3 ? Math.max(...ranks.slice(0, -1)) : mine.rank
    const chips = [`Platz ${mine.rank} von ${state.standings.length}`, `${mine.wins} ${mine.wins === 1 ? 'Sieg' : 'Siege'}`]
    if (fl?.name === me) chips.push('Schnellste Runde')
    else if (mine.bonuses.some((b) => b.kind === 'personalBest')) chips.push('Neue Bestzeit')
    else if (mine.bestLapMs != null) chips.push(`Beste Runde ${fmtSec(mine.bestLapMs)}`)
    let title: string
    if (mine.rank === 1 && f.wireToWire === me) title = done ? 'Start-Ziel-Sieg!' : 'Von Anfang an vorn'
    else if (mine.rank === 1 && worst >= 3) title = done ? `Vom ${worst}. Platz zum Sieg` : `Vom ${worst}. Platz an die Spitze`
    else if (mine.rank === 1) title = done ? 'Gewonnen!' : 'Du bist vorn'
    else if (mine.rank <= 3 && worst > 3) title = `Vom ${worst}. Platz aufs Podest`
    else if (mine.rank <= 3) title = 'Auf dem Podest'
    else if (f.jump?.name === me) title = `Raketensprung in ${f.jump.label}`
    else if (fl?.name === me) title = 'Die schnellste Runde gehört dir'
    else if (mine.wins > 0) title = mine.wins === 1 ? 'Ein Laufsieg für dich' : `${mine.wins} Laufsiege für dich`
    else title = done ? `Platz ${mine.rank} – nächstes Mal mehr` : `Platz ${mine.rank} – da geht noch was`
    return { title, chips }
  }
  const [a, b] = state.standings
  const chips: string[] = []
  if (f.leadChanges > 0) chips.push(`${f.leadChanges}× Führungswechsel`)
  if (f.closest) chips.push(`Knappstes Rennen ${fmtSec(f.closest.ms)}`)
  if (fl) chips.push(`Schnellste Runde ${fmtSec(fl.ms)}`)
  if (!a) return { title: 'Es geht gleich los', chips }
  let title: string
  if (f.wireToWire) title = done ? `${f.wireToWire} gewinnt Start-Ziel` : `${f.wireToWire} von Anfang an vorn`
  else if (f.turn && f.leadChanges >= 2) title = `${f.turn.name} dreht den Wettkampf`
  else if (f.comeback && f.comeback.final === 1) title = `${f.comeback.name}: vom ${f.comeback.worst}. Platz ${done ? 'zum Sieg' : 'an die Spitze'}`
  else if (f.closest && f.closest.ms < 200) title = `Fotofinish in ${f.closest.heat.label}`
  else title = `${a.name} ${done ? 'gewinnt' : 'führt'}${b ? ` vor ${b.name}` : ''}`
  return { title, chips: chips.slice(0, 3) }
}
