import { isGuest } from '../drivers'
import { computeEvent, type EventContext, type EventState, type Heat } from './engine'
import { endSentence, type Story } from './insights'
import { changeoverMinutes, heatDriveMs } from './simulate'
import type { EventDef } from './types'

const fmt1 = (v: number) => v.toLocaleString('de-DE', { maximumFractionDigits: 1 })
const fmtSec = (ms: number, digits = 3) => `${(ms / 1000).toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits })} s`

// ---- Punkteverlauf ---------------------------------------------------------------------------

/** Stand nach einem gefahrenen Lauf */
export interface ProgressStep {
  /** Lauf, nach dem dieser Stand gilt (null = Start) */
  heatId: string | null
  label: string
  totals: Map<string, number>
  ranks: Map<string, number>
  /** Team-ID → Punkte */
  teams: Map<string, number>
}

function stepOf(state: EventState, heat: Heat | null): ProgressStep {
  return {
    heatId: heat?.id ?? null,
    label: heat ? heat.label : 'Start',
    totals: new Map(state.standings.map((s) => [s.name, s.total])),
    ranks: new Map(state.standings.map((s) => [s.name, s.rank])),
    teams: new Map(state.teamStandings.map((t) => [t.id, t.points])),
  }
}

/**
 * Punkteverlauf: Der Wettkampf wird mit den Dateien bis einschließlich jeder neuen Datei neu
 * berechnet. So stimmen Bonuspunkte, Hochrechnung und Leiter-/K.-o.-Wertung genau mit dem Stand
 * überein, den man damals gesehen hätte. Erster Eintrag: Start (alle 0). Läufe, die nichts an den
 * Punkten ändern, werden mit dem vorigen Eintrag zusammengefasst (es gilt der zuletzt gefahrene).
 */
export function pointsHistory(def: EventDef, ctx: EventContext): ProgressStep[] {
  const sessions = [...ctx.sessions].sort((a, b) => a.date.localeCompare(b.date) || a.createdTime.localeCompare(b.createdTime))
  const steps: ProgressStep[] = []
  let done = new Set<string>()
  for (let k = 1; k <= sessions.length; k++) {
    const state = computeEvent(def, { ...ctx, sessions: sessions.slice(0, k) })
    const nowDone = state.heats.filter((h) => h.status === 'done')
    const fresh = nowDone.filter((h) => !done.has(h.id))
    if (!fresh.length) continue
    if (!steps.length) steps.push(stepOf(computeEvent(def, { ...ctx, sessions: [] }), null))
    done = new Set(nowDone.map((h) => h.id))
    const step = stepOf(state, fresh[fresh.length - 1])
    // Läufe ohne Punkteänderung (z. B. Qualifying, das nur die Startreihenfolge festlegt) zusammenfassen
    const prev = steps[steps.length - 1]
    const same = [...step.totals].every(([n, v]) => prev.totals.get(n) === v) && [...step.teams].every(([n, v]) => prev.teams.get(n) === v)
    if (!same) steps.push(step)
    else if (steps.length > 1) steps[steps.length - 1] = { ...step, ranks: prev.ranks }
  }
  return steps
}

// ---- Wann bin ich dran? ----------------------------------------------------------------------

/** Läufe für die Wechselzeit: noch nicht gefahrene mit ihrer geplanten Besetzung (Platzhalter zählen als neue Fahrer) */
const lineup = (h: Heat) => ({ order: h.status === 'done' ? h.order : h.entrants.map((e) => e.name ?? `\u0000${e.label}`), cars: h.cars })

/**
 * Minuten für eine Folge von Läufen: Fahrzeit plus Wechsel vor jedem Lauf (wie im Probelauf).
 * `before` = zuletzt gefahrener Lauf – der Wechsel von dort zum ersten Lauf zählt mit.
 */
function sequenceMinutes(heats: Heat[], before: Heat | null, lapMs: number): number {
  if (!heats.length) return 0
  const drive = heats.reduce((a, h) => a + heatDriveMs(h, lapMs), 0)
  return Math.round(drive / 60_000 + changeoverMinutes([...(before ? [before] : []), ...heats].map(lineup)))
}

export interface Wait {
  heat: Heat
  /** So viele Läufe sind vorher noch dran */
  ahead: number
  /** Geschätzte Wartezeit bis zum Start des eigenen Laufs in Minuten (Fahrzeit und Wechsel) */
  minutes: number
}

const lastDone = (state: EventState) => [...state.heats].reverse().find((h) => h.status === 'done') ?? null

/** Nächster Lauf eines Fahrers, wie viele Läufe vorher kommen und wie lange das etwa dauert */
export function waitFor(state: EventState, driver: string, lapMs: number): Wait | null {
  const open = state.heats.filter((h) => h.status !== 'done')
  const idx = open.findIndex((h) => h.entrants.some((e) => e.name === driver))
  if (idx < 0) return null
  const before = open.slice(0, idx)
  // Fahrzeit der Läufe davor plus alle Wechsel bis einschließlich dem vor dem eigenen Lauf
  const prev = lastDone(state)
  const drive = before.reduce((a, h) => a + heatDriveMs(h, lapMs), 0)
  const seq = [...(prev ? [prev] : []), ...open.slice(0, idx + 1)]
  return { heat: open[idx], ahead: before.length, minutes: Math.round(drive / 60_000 + changeoverMinutes(seq.map(lineup))) }
}

/** Gefahrene und geplante Läufe (ohne „Wie gefahren“) und geschätzte Restzeit in Minuten */
export function eventProgress(state: EventState, lapMs: number) {
  const planned = state.heats.filter((h) => state.def.sections.find((s) => s.id === h.sectionId)?.format !== 'free')
  const open = planned.filter((h) => h.status !== 'done')
  return { done: planned.length - open.length, total: planned.length, minutesLeft: sequenceMinutes(open, lastDone(state), lapMs) }
}

// ---- Woher kommen die Punkte eines Laufs? ----------------------------------------------------

/** Faktor eines Abschnitts in der Gesamtwertung (Gewichtung × Finalbonus); 0 = zählt nicht für die Einzelwertung */
export function sectionFactor(state: EventState, sectionId: string): number {
  const i = state.sections.findIndex((s) => s.def.id === sectionId)
  const sec = state.sections[i]
  if (!sec) return 0
  if (state.separate && sec.def.format === 'team') return 0
  const counts = (s: EventState['sections'][number]) => s.def.weight > 0 && s.def.format !== 'free' && !(state.separate && s.def.format === 'team')
  const last = state.sections.map((s, k) => (counts(s) ? k : -1)).reduce((a, b) => Math.max(a, b), -1)
  return sec.def.weight * (i === last ? state.def.scoring.finaleFactor : 1)
}

/**
 * Punkte eines Fahrers in einem gefahrenen Lauf als kurze Rechnung, z. B. „3 Gegner × 1 + Sieg 1 =
 * 4 Pkt.“; darunter höchstens ein Zusatz (hochgerechnet, Gewichtung, Teamrennen).
 */
export function heatPointsExplained(state: EventState, heat: Heat, name: string): string[] {
  const sc = state.def.scoring
  const pos = heat.order.indexOf(name)
  if (heat.status !== 'done' || pos < 0) return []
  const sec = state.sections.find((s) => s.def.id === heat.sectionId)
  if (heat.advancing) return [heat.advancing.includes(name) ? 'Weiter – Punkte gibt es am Ende der Runde.' : 'Ausgeschieden – Punkte je Fahrer, der früher raus ist.']
  const pts = heat.points.get(name)
  if (pts == null) return []
  const beaten = heat.order.length - 1 - pos
  const won = pos === 0 && heat.order.length > 1 && sc.win > 0
  const fair = sc.method === 'fair'
  const sum = [`${beaten} Gegner${fair ? '' : ` × ${fmt1(sc.perBeaten)}`}`, won ? `Sieg ${fmt1(sc.win)}` : null].filter(Boolean).join(' + ')
  const out = [`${sum} = ${fmt1(pts)} Pkt.`]
  const biggest = Math.max(0, ...(sec?.heats.filter((h) => h.kind === heat.kind).map((h) => h.entrants.length) ?? []))
  const raw = beaten * sc.perBeaten + (won ? sc.win : 0)
  if (fair) out.push('Gegen Stärkere mehr, gegen Schwächere weniger.')
  else if (raw > 0 && Math.abs(raw - pts) > 0.05) out.push(`Hochgerechnet auf ${biggest} Fahrer.`)
  if (sec?.def.format === 'team') out.push(state.separate ? 'Zählt nur für die Teamwertung.' : 'Zählt als Teampunkte (Schnitt im Team).')
  else {
    const f = sectionFactor(state, heat.sectionId)
    if (f === 0) out.push('Zählt nur für die Startreihenfolge.')
    else if (f !== 1) out.push(`Zählt ×${fmt1(f)} in der Gesamtwertung.`)
  }
  return out
}

/** Punkte je Platz in einem Lauf mit n Fahrern (absolute Wertung bzw. gegen Gleichstarke) */
export function placePoints(def: EventDef, n: number): number[] {
  const sc = def.scoring
  return Array.from({ length: Math.max(0, n) }, (_, i) => (n - 1 - i) * sc.perBeaten + (i === 0 && n > 1 ? sc.win : 0))
}

// ---- Rückblick -------------------------------------------------------------------------------

/** Alleiniger Führender eines Stands (null bei Gleichstand oder ohne Punkte) */
function soleLeader(step: ProgressStep): string | null {
  const top = [...step.ranks].filter(([, r]) => r === 1)
  return top.length === 1 && (step.totals.get(top[0][0]) ?? 0) > 0 ? top[0][0] : null
}

export interface RecapFacts {
  /** Führung: wer nach jedem Lauf vorn lag (null = Gleichstand) */
  leaders: (string | null)[]
  /** Anzahl Führungswechsel */
  leadChanges: number
  /** Der Führende lag nach jedem Lauf vorn */
  wireToWire: string | null
  /** Seit diesem Lauf führt der jetzige Führende */
  turn: { name: string; label: string } | null
  /** Größter Sprung in einem Lauf */
  jump: { name: string; from: number; to: number; label: string } | null
  /** Schlechtester Zwischenplatz gegen jetzigen Platz (anderer Fahrer als beim Sprung) */
  comeback: { name: string; worst: number; label: string; final: number } | null
  /** Knappster Abstand Platz 1 zu 2 in einem Rennen (unter 3 s) */
  closest: { heat: Heat; ms: number } | null
  /** Die meisten Laufsiege (allein) */
  mostWins: { name: string; wins: number } | null
  /** Fahrer des Tages: Plätze über der Erwartung */
  driverOfDay: { name: string; over: number } | null
  /** Neue persönliche Bestzeiten */
  personalBests: string[]
  /** Ohne Abflug durch alle Rennen (höchstens drei, sonst nichts Besonderes) */
  clean: string[]
}

/** Besondere Momente des Wettkampfs – für den Rückblick und die Leinwand */
export function recapFacts(state: EventState, steps: ProgressStep[]): RecapFacts {
  const played = steps.slice(1)
  const leaders = played.map(soleLeader)
  const final = leaders[leaders.length - 1] ?? null
  const leadChanges = leaders.reduce((n, l, i) => n + (i > 0 && l && leaders[i - 1] && l !== leaders[i - 1] ? 1 : 0), 0)
  const wireToWire = played.length >= 3 && final && leaders.every((l) => l === final) ? final : null
  let turn: RecapFacts['turn'] = null
  if (played.length >= 3 && final && !wireToWire) {
    let from = leaders.length - 1
    while (from > 0 && leaders[from - 1] === final) from--
    turn = { name: final, label: played[from].label }
  }
  let jump: RecapFacts['jump'] = null
  for (let i = 2; i < steps.length; i++) {
    for (const [n, to] of steps[i].ranks) {
      const from = steps[i - 1].ranks.get(n)
      if (from != null && from - to >= 2 && (!jump || from - to > jump.from - jump.to)) jump = { name: n, from, to, label: steps[i].label }
    }
  }
  let comeback: RecapFacts['comeback'] = null
  if (played.length >= 3) {
    for (const [n, now] of steps[steps.length - 1].ranks) {
      let worst = now
      let label = ''
      for (const s of played.slice(0, -1)) {
        const r = s.ranks.get(n) ?? now
        if (r > worst) [worst, label] = [r, s.label]
      }
      if (n !== jump?.name && worst - now >= 2 && (!comeback || worst - now > comeback.worst - comeback.final)) comeback = { name: n, worst, label, final: now }
    }
  }
  let closest: RecapFacts['closest'] = null
  for (const h of state.heats) {
    if (h.status !== 'done' || h.kind !== 'race' || !h.session || h.order.length < 2) continue
    const second = h.session.results.find((r) => r.driver === h.order[1])
    if (second?.gap.kind === 'time' && second.gap.ms > 0 && second.gap.ms < 3000 && (!closest || second.gap.ms < closest.ms)) closest = { heat: h, ms: second.gap.ms }
  }
  const wins = state.standings.filter((s) => s.wins > 0).sort((x, y) => y.wins - x.wins)
  const mostWins = wins[0] && wins[0].wins >= 2 && (wins[1]?.wins ?? 0) < wins[0].wins ? { name: wins[0].name, wins: wins[0].wins } : null
  const dotd = [...state.overperformance].filter(([n]) => (state.standings.find((s) => s.name === n)?.races ?? 0) >= 2).sort((x, y) => y[1] - x[1])[0]
  const clean = state.standings.filter((s) => s.races >= 2 && !state.heats.some((h) => h.kind === 'race' && h.status === 'done' && h.session?.results.some((r) => r.driver === s.name && r.lapTimes.some((l) => l.status === 'crash'))))
  return {
    leaders,
    leadChanges,
    wireToWire,
    turn,
    jump,
    comeback,
    closest,
    mostWins,
    driverOfDay: dotd && dotd[1] > 0.5 ? { name: dotd[0], over: dotd[1] } : null,
    personalBests: state.standings.filter((s) => s.bonuses.some((x) => x.kind === 'personalBest')).map((s) => s.name),
    clean: clean.length <= 3 ? clean.map((s) => s.name) : [],
  }
}

/** Kurze Sätze zu den besonderen Momenten – für das Laufband der Leinwand */
export function recapMoments(state: EventState, steps: ProgressStep[]): Story[] {
  const f = recapFacts(state, steps)
  const out: Story[] = []
  const [a, b] = state.standings
  if (a && state.started) out.push({ icon: 'crown', text: `${a.name} ${state.complete ? 'gewinnt' : 'führt'} mit ${fmt1(a.total)} Punkten${b ? (a.total > b.total ? ` – ${fmt1(a.total - b.total)} vor ${b.name}` : ` – punktgleich mit ${b.name}`) : ''}.` })
  if (f.wireToWire) out.push({ icon: 'flag', text: `Start-Ziel: ${f.wireToWire} lag nach jedem Lauf vorn.` })
  if (f.turn) out.push({ icon: 'flag', text: `Die Wende: Nach ${f.turn.label} übernahm ${f.turn.name} die Spitze.` })
  if (f.jump) out.push({ icon: 'rocket', text: `Größter Sprung: ${f.jump.name} in ${f.jump.label} von Platz ${f.jump.from} auf ${f.jump.to}.` })
  if (f.closest) out.push({ icon: 'sword', text: `Knappste Entscheidung: ${f.closest.heat.order[0]} kam ${fmtSec(f.closest.ms)} vor ${f.closest.heat.order[1]} ins Ziel (${f.closest.heat.label}).` })
  if (state.fastestLap) out.push({ icon: 'bolt', text: `Schnellste Runde: ${state.fastestLap.name} – ${fmtSec(state.fastestLap.ms)}.` })
  if (f.driverOfDay) out.push({ icon: 'star', text: `Fahrer des Tages: ${f.driverOfDay.name}.` })
  return out.map(endSentence)
}

/** Zahlen zum ganzen Wettkampf */
export function eventNumbers(state: EventState) {
  const done = state.heats.filter((h) => h.status === 'done' && h.session)
  const results = done.flatMap((h) => h.session!.results.filter((r) => !isGuest(r.driver)))
  return {
    heats: done.length,
    laps: results.reduce((a, r) => a + r.laps, 0),
    crashes: results.reduce((a, r) => a + r.lapTimes.filter((l) => l.status === 'crash').length, 0),
    drivers: new Set(results.map((r) => r.driver)).size,
  }
}

export interface MyHeat {
  heat: Heat
  place: number
  of: number
  points: number | null
}

/** Eigener Rückblick: Läufe mit Platz und Punkten, Plätze im Verlauf */
export function myRecap(state: EventState, steps: ProgressStep[], name: string) {
  const heats: MyHeat[] = state.heats
    .filter((h) => h.status === 'done' && h.order.includes(name))
    .map((h) => ({ heat: h, place: h.order.indexOf(name) + 1, of: h.order.length, points: h.points.get(name) ?? null }))
  const ranks = steps.slice(1).map((s) => s.ranks.get(name) ?? null)
  const known = ranks.filter((r): r is number => r != null)
  const best = [...heats].filter((h) => h.heat.kind === 'race').sort((a, b) => a.place - b.place || (b.points ?? 0) - (a.points ?? 0))[0] ?? null
  return { heats, ranks, bestRank: known.length ? Math.min(...known) : null, best }
}
