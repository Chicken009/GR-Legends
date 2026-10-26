import { isGuest } from '../drivers'
import { computeEvent, type EventContext, type EventState, type Heat } from './engine'
import type { Story } from './insights'
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

/** Erklärung der Punkte eines Fahrers in einem gefahrenen Lauf, Zeile für Zeile */
export function heatPointsExplained(state: EventState, heat: Heat, name: string): string[] {
  const sc = state.def.scoring
  const pos = heat.order.indexOf(name)
  if (heat.status !== 'done' || pos < 0) return []
  const sec = state.sections.find((s) => s.def.id === heat.sectionId)
  if (heat.advancing) {
    return [
      heat.advancing.includes(name) ? 'Weiter in die nächste Runde – Punkte gibt es erst, wenn feststeht, in welcher Runde es endet.' : `Hier ausgeschieden: Punkte für jeden, der früher ausgeschieden ist${sc.method === 'fair' ? ' (gegen Stärkere mehr)' : ''}.`,
    ]
  }
  const pts = heat.points.get(name)
  if (pts == null) return []
  const beaten = heat.order.length - 1 - pos
  const out: string[] = []
  if (heat.kind === 'quali') out.push(`Platz ${pos + 1} nach schnellster Runde.`)
  if (sc.method === 'fair') {
    out.push(beaten ? `${beaten} Gegner dahinter – gegen Gleichstarke je ${fmt1(sc.perBeaten)}, gegen Stärkere bis ${fmt1(sc.perBeaten * 2)}, gegen Schwächere weniger.` : 'Kein Gegner dahinter.')
  } else {
    out.push(beaten ? `${beaten} Gegner dahinter × ${fmt1(sc.perBeaten)} = ${fmt1(beaten * sc.perBeaten)}` : 'Kein Gegner dahinter: 0')
  }
  if (pos === 0 && heat.order.length > 1 && sc.win) out.push(sc.method === 'fair' && sc.fairWin ? `Siegbonus bis +${fmt1(sc.win * 2)}, nach Stärke der Gegner.` : `Siegbonus +${fmt1(sc.win)}`)
  if (sc.method === 'absolute') {
    const raw = beaten * sc.perBeaten + (pos === 0 && heat.order.length > 1 ? sc.win : 0)
    const biggest = Math.max(0, ...(sec?.heats.filter((h) => h.kind === heat.kind).map((h) => h.entrants.length) ?? []))
    if (raw > 0 && Math.abs(raw - pts) > 0.05) out.push(`Hochgerechnet auf einen Lauf mit ${biggest} Fahrern: ${fmt1(raw)} → ${fmt1(pts)}`)
  } else if (sec && heat.order.length < Math.max(0, ...sec.heats.filter((h) => h.kind === heat.kind).map((h) => h.entrants.length))) {
    out.push('Weniger Fahrer im Lauf: Die Punkte werden auf den größten Lauf hochgerechnet.')
  }
  out.push(`Im Lauf: ${fmt1(pts)} ${pts === 1 ? 'Punkt' : 'Punkte'}`)
  if (sec?.def.format === 'team') {
    out.push(state.separate ? 'Teamrennen: zählt nur für die Teamwertung (Schnitt der Fahrer im Team).' : 'Teamrennen: Jedes Team bekommt den Schnitt seiner Fahrer, alle Mitglieder die Teampunkte.')
  } else {
    const f = sectionFactor(state, heat.sectionId)
    if (f === 0) out.push(`${sec?.def.name ?? 'Abschnitt'} zählt nur für die Startreihenfolge.`)
    else if (f !== 1) out.push(`${sec?.def.name ?? 'Abschnitt'} zählt ×${fmt1(f)} in der Gesamtwertung.`)
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

/** Besondere Momente des Wettkampfs – für den Rückblick und die Leinwand */
export function recapMoments(state: EventState, steps: ProgressStep[]): Story[] {
  const out: Story[] = []
  const [a, b] = state.standings
  const over = state.complete ? '' : ' bisher'
  if (a && state.started) {
    const gap = b ? a.total - b.total : 0
    const won = state.complete ? `${a.name} gewinnt ${state.def.name} mit ${fmt1(a.total)} Punkten` : `${a.name} führt mit ${fmt1(a.total)} Punkten`
    out.push({ icon: 'crown', text: b ? `${won}${gap > 0 ? ` – ${fmt1(gap)} vor ${b.name}` : ` – punktgleich mit ${b.name}`}.` : `${won}.` })
  }
  const team = state.teamStandings[0]
  if (team && state.started && team.points > 0) {
    const second = state.teamStandings[1]
    out.push({ icon: 'crown', text: `${team.name} ${state.complete ? 'gewinnt' : 'führt'} die Teamwertung${second ? ` – ${fmt1(team.points - second.points)} vor ${second.name}` : ''}.` })
  }
  // Führung: Start-Ziel oder die entscheidende Wende
  const played = steps.slice(1)
  if (played.length >= 3) {
    const leaders = played.map(soleLeader)
    const final = leaders[leaders.length - 1]
    const changes = leaders.reduce((n, l, i) => n + (i > 0 && l && leaders[i - 1] && l !== leaders[i - 1] ? 1 : 0), 0)
    if (final && leaders.every((l) => l === final)) out.push({ icon: 'flag', text: `Start-Ziel: ${final} lag nach jedem Lauf vorn.` })
    else if (final) {
      let from = leaders.length - 1
      while (from > 0 && leaders[from - 1] === final) from--
      out.push({ icon: 'flag', text: `${changes > 1 ? `${changes} Führungswechsel. ` : ''}Die Wende: Nach ${played[from].label} übernahm ${final} die Spitze${state.complete ? ' und gab sie nicht mehr ab' : ''}.` })
    }
  }
  // Größter Sprung in einem Lauf
  let jump: { name: string; from: number; to: number; label: string } | null = null
  for (let i = 2; i < steps.length; i++) {
    for (const [n, to] of steps[i].ranks) {
      const from = steps[i - 1].ranks.get(n)
      if (from != null && from - to >= 2 && (!jump || from - to > jump.from - jump.to)) jump = { name: n, from, to, label: steps[i].label }
    }
  }
  if (jump) out.push({ icon: 'rocket', text: `Größter Sprung: ${jump.name} klettert in ${jump.label} von Platz ${jump.from} auf ${jump.to}.` })
  // Aufholjagd: schlechtester Zwischenplatz gegen Endplatz
  if (played.length >= 3) {
    const last = steps[steps.length - 1]
    let best: { name: string; worst: number; label: string; final: number } | null = null
    for (const [n, final] of last.ranks) {
      let worst = final
      let label = ''
      for (const s of played.slice(0, -1)) {
        const r = s.ranks.get(n) ?? final
        if (r > worst) [worst, label] = [r, s.label]
      }
      if (worst - final >= 2 && (!best || worst - final > best.worst - best.final)) best = { name: n, worst, label, final }
    }
    if (best && best.name !== jump?.name) out.push({ icon: 'rocket', text: `Aufholjagd: ${best.name} lag nach ${best.label} auf Platz ${best.worst} und ${state.complete ? 'wurde noch' : 'ist jetzt'} ${best.final}.` })
  }
  // Knappste Entscheidung (Abstand Platz 1 zu 2 im Rennen)
  let close: { heat: Heat; ms: number } | null = null
  for (const h of state.heats) {
    if (h.status !== 'done' || h.kind !== 'race' || !h.session || h.order.length < 2) continue
    const second = h.session.results.find((r) => r.driver === h.order[1])
    if (second?.gap.kind === 'time' && second.gap.ms > 0 && (!close || second.gap.ms < close.ms)) close = { heat: h, ms: second.gap.ms }
  }
  if (close && close.ms < 3000) out.push({ icon: 'sword', text: `Knappste Entscheidung: ${close.heat.label} – ${close.heat.order[0]} vor ${close.heat.order[1]}, nur ${fmtSec(close.ms)}.` })
  // Siege
  const wins = [...state.standings].filter((s) => s.wins > 0).sort((x, y) => y.wins - x.wins)
  if (wins[0] && wins[0].wins >= 2 && (wins[1]?.wins ?? 0) < wins[0].wins) out.push({ icon: 'star', text: `Die meisten Laufsiege: ${wins[0].name} mit ${wins[0].wins}.` })
  const dotd = [...state.overperformance].filter(([n]) => (state.standings.find((s) => s.name === n)?.races ?? 0) >= 2).sort((x, y) => y[1] - x[1])[0]
  if (dotd && dotd[1] > 0.5) out.push({ icon: 'star', text: `Fahrer des Tages${over}: ${dotd[0]} – ${fmt1(dotd[1])} Plätze über der Erwartung.` })
  if (state.fastestLap) out.push({ icon: 'bolt', text: `Schnellste Runde: ${state.fastestLap.name} – ${fmtSec(state.fastestLap.ms)}${state.fastestLap.car ? ` im ${state.fastestLap.car}` : ''}.` })
  const pbs = state.standings.filter((s) => s.bonuses.some((x) => x.kind === 'personalBest')).map((s) => s.name)
  if (pbs.length) out.push({ icon: 'bolt', text: `Neue persönliche Bestzeit: ${pbs.join(', ')}.` })
  // Ohne Abflug durch alle Rennen
  const clean = state.standings.filter((s) => {
    if (s.races < 2) return false
    return !state.heats.some((h) => h.kind === 'race' && h.status === 'done' && h.session?.results.some((r) => r.driver === s.name && r.lapTimes.some((l) => l.status === 'crash')))
  })
  if (clean.length && clean.length <= 3) out.push({ icon: 'flag', text: `Ohne einen Abflug durch alle Rennen: ${clean.map((s) => s.name).join(', ')}.` })
  return out
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
