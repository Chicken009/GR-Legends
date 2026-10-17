import { describe, expect, it } from 'vitest'
import type { Result, Session } from '../../types'
import { buildTeams, chunkEven, computeEvent, ladderAuto, ladderSizes, snake, type EventContext } from './engine'
import { driverInsight, eventPhase, planVisible, storylines } from './insights'
import { normalizeEvent, serializeEvent } from './normalize'
import { playThrough, simulate } from './simulate'
import { newSection } from './templates'
import type { EventDef } from './types'

const ELO: Record<string, number> = { A: 700, B: 650, C: 600, D: 550, E: 500, F: 450, G: 400 }
const ctx = (sessions: Session[] = []): EventContext => ({ sessions, elo: (n) => ELO[n] ?? 500, car: () => 0, previousBest: () => null })

let t = 0
function run(kind: 'quali' | 'race', order: string[], opts: { laps?: number[]; best?: number[]; car?: string; id?: string } = {}): Session {
  t++
  const time = new Date(Date.UTC(2026, 5, 1, 18, t)).toISOString()
  const results: Result[] = order.map((driver, i) => {
    const best = opts.best?.[i] ?? 10000 + i * 100
    return {
      position: i + 1,
      gap: i === 0 ? { kind: 'leader' } : { kind: 'none' },
      driver,
      car: opts.car ?? `Auto ${driver}`,
      laps: 10 - i,
      bestLapMs: best,
      validBestLapMs: best,
      pitStops: 0,
      lapTimes: (opts.laps ?? []).map((ms, k) => ({ number: k + 1, ms, status: 'normal' as const })),
    }
  })
  return {
    fileId: opts.id ?? `f${t}`,
    fileName: kind === 'quali' ? 'Qualifikation_01.06.2026.csv' : 'Rennen_01.06.2026.csv',
    track: 'Test',
    trackLengthCm: null,
    date: '2026-06-01',
    type: kind === 'quali' ? 'Qualifikation' : 'Rennen',
    createdTime: time,
    modifiedTime: time,
    heat: 1,
    results,
  }
}

function def(partial: Partial<EventDef> & { sections: EventDef['sections'] }): EventDef {
  return normalizeEvent({ name: 'Test-Cup', start: '2026-06-01', drivers: ['A', 'B', 'C', 'D', 'E', 'F'], ...partial })
}

describe('Hilfen', () => {
  it('verteilt in Schlangenreihenfolge', () => {
    expect(snake([1, 2, 3, 4, 5, 6], 2)).toEqual([[1, 4, 5], [2, 3, 6]])
  })
  it('teilt gleichmäßig', () => {
    expect(chunkEven([1, 2, 3, 4, 5], 4).map((g) => g.length)).toEqual([3, 2])
  })
  it('berechnet die Leiter', () => {
    expect(ladderSizes(4, 4, 2)).toEqual([4])
    expect(ladderSizes(6, 4, 2)).toEqual([4, 2])
    expect(ladderSizes(7, 4, 2)).toEqual([3, 2, 2])
    expect(ladderSizes(10, 4, 2)).toEqual([4, 2, 2, 2])
  })
})

describe('normalizeEvent', () => {
  it('ergänzt Standardwerte und prüft das Datum', () => {
    const d = normalizeEvent({ name: 'X', start: '2026-01-01', sections: [{ format: 'quali' }] })
    expect(d.maxPerHeat).toBe(4)
    expect(d.sections[0].weight).toBe(0)
    expect(d.scoring.perBeaten).toBe(1)
    expect(() => normalizeEvent({ name: 'X', start: '1.1.2026' })).toThrow(/Startdatum/)
  })
  it('macht Abschnitts-IDs eindeutig und übersteht den Rundweg', () => {
    const d = normalizeEvent({ name: 'X', start: '2026-01-01', sections: [{ id: 'a', format: 'races' }, { id: 'a', format: 'races' }] })
    expect(new Set(d.sections.map((s) => s.id)).size).toBe(2)
    expect(normalizeEvent(JSON.parse(serializeEvent(d)))).toEqual(d)
  })
})

describe('Qualifying und Aufstiegsleiter', () => {
  const sections = [newSection('quali', { id: 'q', maxPerHeat: 1 }), newSection('ladder', { id: 'l', advance: 2 })]

  it('plant Einzel-Qualifying, Stärkste zum Schluss, Leiter wartet', () => {
    const s = computeEvent(def({ sections }), ctx())
    const q = s.sections[0]
    expect(q.heats).toHaveLength(6)
    expect(q.heats[0].entrants[0].name).toBe('F')
    expect(q.heats[5].entrants[0].name).toBe('A')
    expect(s.next?.id).toBe('q-1')
    expect(s.sections[1].heats.every((h) => h.status === 'waiting')).toBe(true)
  })

  it('ordnet Dateien zu und lässt die Besten aufsteigen', () => {
    // Quali: B schnellste Runde, dann A, C, D, E, F
    const times: Record<string, number> = { B: 9800, A: 9900, C: 10000, D: 10100, E: 10200, F: 10300 }
    const quali = ['F', 'E', 'D', 'C', 'B', 'A'].map((n) => run('quali', [n], { best: [times[n]] }))
    let s = computeEvent(def({ sections }), ctx(quali))
    expect(s.sections[0].complete).toBe(true)
    expect(s.sections[0].ranking.map((r) => r.name)).toEqual(['B', 'A', 'C', 'D', 'E', 'F'])
    // Leiter 6 Fahrer, 4 gleichzeitig, 2 steigen auf: Rennen 1 = C, D, E, F; Finale = B, A + 2
    const [r1, fin] = s.sections[1].heats
    expect(r1.entrants.map((e) => e.name)).toEqual(['C', 'D', 'E', 'F'])
    expect(fin.label).toBe('Finale')
    expect(fin.entrants.filter((e) => e.name == null)).toHaveLength(2)
    const race1 = run('race', ['E', 'C', 'D', 'F'])
    s = computeEvent(def({ sections }), ctx([...quali, race1]))
    // Rennen 1 bringt noch keine Punkte, nur den Aufstieg
    expect(s.sections[1].heats[0].advancing).toEqual(['E', 'C'])
    expect(s.sections[1].heats[0].points.size).toBe(0)
    // Zwischenstand: Wer noch im Finale fährt, hat sicher D und F hinter sich (2 Punkte) – mehr nicht
    const mid = new Map(s.sections[1].ranking.map((r) => [r.name, r.points]))
    expect([mid.get('A'), mid.get('B'), mid.get('C'), mid.get('E')]).toEqual([2, 2, 2, 2])
    expect([mid.get('D'), mid.get('F')]).toEqual([1, 0])
    const final = s.sections[1].heats[1]
    expect(final.entrants.map((e) => e.name)).toEqual(['E', 'C', 'B', 'A'])
    expect(s.next?.id).toBe(final.id)
    const race2 = run('race', ['C', 'A', 'E', 'B'])
    s = computeEvent(def({ sections }), ctx([...quali, race1, race2]))
    expect(s.complete).toBe(true)
    expect(s.sections[1].ranking.map((r) => r.name)).toEqual(['C', 'A', 'E', 'B', 'D', 'F'])
    // Endstand: je geschlagenem Fahrer 1 Punkt, Sieger +1
    expect(s.sections[1].ranking.map((r) => r.points)).toEqual([6, 4, 3, 2, 1, 0])
    // Ohne Bonus gewinnt der Leiter-Sieger; Bonuspunkte (schnellste Runde, Fahrer des Tages) können das drehen
    const plain = computeEvent(def({ sections, scoring: { fastestLap: 0, driverOfDay: 0, pole: 1 } } as never), ctx([...quali, race1, race2]))
    expect(plain.standings[0].name).toBe('C')
    // Pole-Bonus für B
    expect(s.standings.find((r) => r.name === 'B')!.bonuses.some((b) => b.kind === 'pole')).toBe(true)
  })

  it('übernimmt Ersatzfahrer und manuelle Zuordnung', () => {
    const quali = ['F', 'E', 'D', 'C', 'B', 'A'].map((n, i) => run('quali', [n], { best: [10000 + i] }))
    // Rennen 1 geplant mit A, B, C, D (umgekehrte Quali), gefahren ist G statt D
    const race = run('race', ['G', 'A', 'B', 'C'])
    const s = computeEvent(def({ sections }), ctx([...quali, race]))
    const r1 = s.sections[1].heats[0]
    expect(r1.session?.fileId).toBe(race.fileId)
    expect(r1.entrants.map((e) => e.name)).toContain('G')
    // Datei ignorieren
    const ignored = computeEvent(def({ sections, matches: { [race.fileId]: 'ignore' } }), ctx([...quali, race]))
    expect(ignored.sections[1].heats[0].session).toBeNull()
    expect(ignored.unmatched).toHaveLength(0)
  })
})

describe('Rennen, K.-o. und Teams', () => {
  it('verteilt Gruppen ausgeglichen und addiert Punkte', () => {
    const d = def({ sections: [newSection('races', { id: 'r', rounds: 2, seeding: 'elo' })] })
    const s = computeEvent(d, ctx())
    expect(s.heats).toHaveLength(4)
    expect(s.heats[0].entrants.map((e) => e.name)).toEqual(['A', 'D', 'E'])
    const files = s.heats.map((h) => run('race', h.entrants.map((e) => e.name!)))
    const done = computeEvent(d, ctx(files))
    expect(done.complete).toBe(true)
    expect(done.sections[0].ranking[0].points).toBeGreaterThan(0)
  })

  it('spielt ein K.-o.-Turnier bis zum Finale', () => {
    const d = def({ drivers: ['A', 'B', 'C', 'D'], sections: [newSection('ko', { id: 'k', maxPerHeat: 2, advance: 1, seeding: 'elo' })] })
    const s = playThrough(d, ctx(), 'x', 10000)
    expect(s.complete).toBe(true)
    expect(s.heats.map((h) => h.label)).toEqual(['Halbfinale 1', 'Halbfinale 2', 'Finale'])
    expect(s.sections[0].ranking).toHaveLength(4)
    // Beide Halbfinal-Verlierer teilen sich Platz 3
    expect(s.sections[0].ranking.map((r) => r.rank)).toEqual([1, 2, 3, 3])
    expect(s.sections[0].ranking.map((r) => r.points)).toEqual([4, 2, 0, 0])
  })

  it('bildet ausgeglichene Teams, die bei jedem gleich sind', () => {
    const d = def({ drivers: ['A', 'B', 'C', 'D', 'E', 'F', 'G'], teams: { mode: 'elo', size: 2, teams: [] }, sections: [] })
    const { teams } = buildTeams(d, d.drivers, (n) => ELO[n])
    expect(teams.map((t) => t.drivers.length)).toEqual([3, 2, 2])
    expect(teams[0].drivers).toEqual(['A', 'F', 'G'])
    const random = { ...d, teams: { mode: 'random' as const, size: 2, teams: [] } }
    expect(buildTeams(random, d.drivers, (n) => ELO[n]).teams).toEqual(buildTeams(random, d.drivers, (n) => ELO[n]).teams)
  })

  it('wertet Teamrennen mit dem Schnitt und gibt allen Mitgliedern die Teampunkte', () => {
    const d = def({ drivers: ['A', 'B', 'C', 'D'], teams: { mode: 'manual', size: 2, teams: [{ name: 'Rot', drivers: ['A', 'D'] }, { name: 'Blau', drivers: ['B', 'C'] }] }, sections: [newSection('team', { id: 't' })] })
    const s = computeEvent(d, ctx([run('race', ['A', 'B', 'C', 'D'])]))
    const heat = s.sections[0].heats[0]
    expect(heat.status).toBe('done')
    // A 3+1 = 4, D 0 → Rot 2; B 2, C 1 → Blau 1,5
    expect(heat.teamPoints!.get('t1')).toBe(2)
    expect(heat.teamPoints!.get('t2')).toBe(1.5)
    expect(s.standings.find((r) => r.name === 'D')!.sections[0]).toBe(2)
    expect(s.teamStandings[0].name).toBe('Rot')
  })

  it('lässt bei Positionsduellen den Schwächsten eines kleineren Teams doppelt fahren', () => {
    const d = def({ drivers: ['A', 'B', 'C', 'D', 'E'], maxPerHeat: 4, teams: { mode: 'manual', size: 3, teams: [{ name: 'X', drivers: ['A', 'B', 'C'] }, { name: 'Y', drivers: ['D', 'E'] }] }, sections: [newSection('team', { id: 't' })] })
    const s = computeEvent(d, ctx())
    expect(s.heats.map((h) => h.entrants.map((e) => e.name))).toEqual([['A', 'D'], ['B', 'E'], ['C', 'E']])
  })
})

describe('Automatische Aufstiegsleiter und Autoliste', () => {
  const sizes = (r: { direct: number[]; advance: number[] }) => r.direct.map((d, i) => d + (i ? r.advance[i - 1] : 0))

  it('lässt je Rennen die Hälfte aufsteigen, Rennen voll oder unten kleiner', () => {
    expect(sizes(ladderAuto(7, 4))).toEqual([2, 4, 4])
    expect(ladderAuto(7, 4).advance).toEqual([1, 2, 0])
    expect(sizes(ladderAuto(10, 6))).toEqual([4, 4, 6])
    expect(sizes(ladderAuto(6, 5))).toEqual([2, 5])
    for (const per of [3, 4, 5, 6]) for (let n = 2; n <= 20; n++) expect(ladderAuto(n, per).direct.reduce((a, b) => a + b, 0)).toBe(n)
    const d = def({ drivers: ['A', 'B', 'C', 'D', 'E', 'F', 'G'], sections: [newSection('ladder', { id: 'l', seeding: 'elo' })] })
    const s = computeEvent(d, ctx())
    expect(s.heats.map((h) => h.entrants.length)).toEqual([2, 4, 4])
    expect(s.heats.map((h) => h.note)).toEqual(['Der Sieger steigt auf', 'Top 2 steigen auf', 'Entscheidet den Sieg'])
  })

  it('fährt höchstens so viele gleichzeitig, wie Autos ausgewählt sind', () => {
    const d = def({ drivers: ['A', 'B', 'C', 'D', 'E', 'F'], maxPerHeat: 4, cars: { scale: '1:32', mode: 'skill', pool: ['X', 'Y', 'Z'], fixed: {} }, sections: [newSection('races', { id: 'r', rounds: 1 })] })
    const s = computeEvent(d, ctx())
    expect(s.heats.map((h) => h.entrants.length)).toEqual([3, 3])
    for (const h of s.heats) expect(new Set(Object.values(h.cars)).size).toBe(h.entrants.length)
    expect(s.warnings.some((w) => w.includes('höchstens 3'))).toBe(true)
  })
})

describe('Ungleich große Läufe', () => {
  const seven = ['A', 'B', 'C', 'D', 'E', 'F', 'G']

  it('Rennen in Gruppen: den kleineren Lauf fährt jeder reihum, Punkte hochgerechnet', () => {
    const d = def({ drivers: seven, maxPerHeat: 4, sections: [newSection('races', { id: 'r', rounds: 3, seeding: 'elo' })] })
    const plan = computeEvent(d, ctx())
    const inSmall = new Map<string, number>()
    for (const h of plan.heats) if (h.entrants.length === 3) for (const e of h.entrants) inSmall.set(e.name!, (inSmall.get(e.name!) ?? 0) + 1)
    // 3 Durchgänge × 3 Plätze im kleinen Lauf = 9 Plätze für 7 Fahrer: jeder 1- oder 2-mal
    expect(seven.map((n) => inSmall.get(n) ?? 0).sort()).toEqual([1, 1, 1, 1, 1, 2, 2])
    // Dreierlauf: Sieger 2 + 1 = 3, Zweiter 1 – × 1,75 / 1,33 (erwartete Punkte im Vierer- / Dreierlauf)
    const first = plan.heats[0].entrants.length === 3 ? plan.heats[0] : plan.heats[1]
    const s = computeEvent({ ...d, sections: [newSection('races', { id: 'r', rounds: 1, seeding: 'elo' })] }, ctx([run('race', first.entrants.map((e) => e.name!))]))
    const h = s.heats.find((x) => x.status === 'done')!
    expect([...h.points.values()]).toEqual([3.9, 1.3, 0])
  })

  it('K.-o.: in jeder Gruppe scheiden gleich viele aus', () => {
    const d = def({ drivers: seven, maxPerHeat: 4, sections: [newSection('ko', { id: 'k', advance: 1, seeding: 'elo' })] })
    const plan = computeEvent(d, ctx())
    // 4er- und 3er-Gruppe: in beiden scheiden 2 aus – also 2 und 1 kommen weiter, 3 im Finale
    const [a, b, final] = plan.heats
    const g1 = a.entrants.length === 4 ? a : b
    const g2 = g1 === a ? b : a
    expect([g1.entrants.length, g2.entrants.length, final.entrants.length]).toEqual([4, 3, 3])
    expect([g1.note, g2.note, final.note]).toEqual(['Top 2 kommen weiter', 'Top 1 kommen weiter', 'Entscheidet den Sieg'])
    const played = computeEvent(d, ctx([run('race', g1.entrants.map((e) => e.name!)), run('race', g2.entrants.map((e) => e.name!))]))
    // Erste Ausgeschiedene beider Gruppen (P3 bzw. P2) teilen sich den Platz
    const r = played.sections[0].ranking
    const rank = (n: string) => r.find((x) => x.name === n)!.rank
    expect(rank(g1.entrants[2].name!)).toBe(rank(g2.entrants[1].name!))
  })
})

describe('Teamrennen: Paarungen und Ausgleich', () => {
  const teamsOf = (names: string[][]) => names.map((drivers, i) => ({ name: `T${i + 1}`, drivers }))
  const pairsOf = (s: ReturnType<typeof computeEvent>) => s.heats.map((h) => [...new Set(Object.values(h.teamOf ?? {}))].sort().join('-'))

  it('ein Durchgang = jedes Team einmal gegen jedes, halber Durchgang mit ausgeglichenen Gegnern', () => {
    const teams = teamsOf([['A', 'H'], ['B', 'G'], ['C', 'F'], ['D', 'E']])
    const d = def({ drivers: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], maxPerHeat: 4, teams: { mode: 'manual', size: 2, teams }, sections: [newSection('team', { id: 't' })] })
    const full = computeEvent(d, ctx())
    expect(new Set(pairsOf(full))).toEqual(new Set(['t1-t2', 't1-t3', 't1-t4', 't2-t3', 't2-t4', 't3-t4']))
    expect(full.sections[0].teamPlan).toMatchObject({ mode: 'pairs', perRound: 6, halfPossible: true, halfCount: 4 })
    const twice = computeEvent({ ...d, sections: [newSection('team', { id: 't', rounds: 2 })] }, ctx())
    expect(twice.heats).toHaveLength(12)
    const half = computeEvent({ ...d, sections: [newSection('team', { id: 't', half: true })] }, ctx())
    expect(half.heats).toHaveLength(4)
    const count = new Map<string, number>()
    for (const p of pairsOf(half)) for (const t of p.split('-')) count.set(t, (count.get(t) ?? 0) + 1)
    expect([...count.values()]).toEqual([2, 2, 2, 2])
  })

  it('rechnet kleinere Läufe hoch und gleicht Pausen aus', () => {
    // 3 Einzelteams bei 2 Spuren: jeder gegen jeden mit Pause, jedes Team fährt 2 von 3 Läufen
    const teams = teamsOf([['A'], ['B'], ['C']])
    const d = def({ drivers: ['A', 'B', 'C'], maxPerHeat: 2, teams: { mode: 'manual', size: 1, teams }, sections: [newSection('team', { id: 't' })] })
    const s = computeEvent(d, ctx())
    expect(s.heats.every((h) => h.entrants.length === 2)).toBe(true)
    expect(new Set(pairsOf(s))).toEqual(new Set(['t1-t2', 't1-t3', 't2-t3']))
    // 5 Einzelteams bei 4 Spuren: Läufe mit 3 und 2 Fahrern – Punkte des kleineren Laufs hochgerechnet
    const five = def({ drivers: ['A', 'B', 'C', 'D', 'E'], maxPerHeat: 4, teams: { mode: 'manual', size: 1, teams: teamsOf([['A'], ['B'], ['C'], ['D'], ['E']]) }, sections: [newSection('team', { id: 't' })] })
    const plan = computeEvent(five, ctx())
    expect(plan.heats.map((h) => h.entrants.length)).toEqual([3, 2])
    const played = computeEvent(five, ctx([run('race', plan.heats[0].entrants.map((e) => e.name!)), run('race', plan.heats[1].entrants.map((e) => e.name!))]))
    expect(played.heats[0].teamPoints!.get('t1')).toBe(3) // 2 geschlagen + Sieg
    expect(played.heats[1].teamPoints!.get('t4')).toBe(2.7) // (1 + Sieg) × (4/3) / 1
  })

  it('Team gegen Team mit geteilten Teams: Aufstellung wechselt reihum, jeder gleich oft', () => {
    const teams = teamsOf([['A', 'C', 'E'], ['B', 'D', 'F']])
    const d = def({ drivers: ['A', 'B', 'C', 'D', 'E', 'F'], maxPerHeat: 4, teams: { mode: 'manual', size: 3, teams }, sections: [newSection('team', { id: 't', teamMode: 'teams' })] })
    const s = computeEvent(d, ctx())
    expect(s.sections[0].teamPlan).toMatchObject({ mode: 'split', perTeam: 2, perRound: 3 })
    expect(s.heats.every((h) => h.entrants.length === 4)).toBe(true)
    const count = new Map<string, number>()
    for (const h of s.heats) for (const e of h.entrants) count.set(e.name!, (count.get(e.name!) ?? 0) + 1)
    expect([...count.values()]).toEqual([2, 2, 2, 2, 2, 2])
    // jeder trifft auf jeden Gegner
    const met = (x: string, y: string) => s.heats.some((h) => h.entrants.some((e) => e.name === x) && h.entrants.some((e) => e.name === y))
    for (const a of ['A', 'C', 'E']) for (const b of ['B', 'D', 'F']) expect(met(a, b)).toBe(true)
    // automatisch bleiben es Positionsduelle
    expect(computeEvent({ ...d, sections: [newSection('team', { id: 't' })] }, ctx()).sections[0].teamPlan?.mode).toBe('slots')
  })

  it('Ein Fahrer je Team, auch wenn alle Teams auf die Bahn passen', () => {
    const teams = teamsOf([['A', 'D'], ['B', 'E']])
    const d = def({ drivers: ['A', 'B', 'D', 'E'], maxPerHeat: 4, teams: { mode: 'manual', size: 2, teams }, sections: [newSection('team', { id: 't', teamMode: 'single' })] })
    const s = computeEvent(d, ctx())
    expect(s.heats.map((h) => h.entrants.map((e) => e.name))).toEqual([['A', 'B'], ['D', 'E']])
  })

  it('mischt Positionsduelle, wenn nicht alle Teams in einen Lauf passen', () => {
    const teams = teamsOf([['A', 'E'], ['B', 'F'], ['C', 'G'], ['D', 'H']])
    const d = def({ drivers: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], maxPerHeat: 3, teams: { mode: 'manual', size: 2, teams }, sections: [newSection('team', { id: 't', rounds: 3 })] })
    const s = computeEvent(d, ctx())
    expect(s.sections[0].teamPlan?.mode).toBe('slots')
    expect(new Set(pairsOf(s)).size).toBeGreaterThan(2)
  })
})

describe('Wertung und Autos', () => {
  it('fair: Sieg gegen Stärkere bringt mehr', () => {
    const d = def({ drivers: ['A', 'G'], scoring: { method: 'fair', perBeaten: 1, win: 0 }, sections: [newSection('races', { id: 'r', rounds: 1 })] } as never)
    const upset = computeEvent(d, ctx([run('race', ['G', 'A'])]))
    const normal = computeEvent(d, ctx([run('race', ['A', 'G'])]))
    expect(upset.standings[0].total).toBeGreaterThan(normal.standings[0].total)
  })

  it('Finalbonus zählt den letzten Abschnitt mehrfach', () => {
    const d = def({ drivers: ['A', 'B'], scoring: { finaleFactor: 2, fastestLap: 0, driverOfDay: 0 }, sections: [newSection('races', { id: 'r', rounds: 1 })] } as never)
    const s = computeEvent(d, ctx([run('race', ['A', 'B'])]))
    expect(s.standings[0].total).toBe(4)
  })

  it('teilt Autos nach Können zu und tauscht zufällig zugeteilte Autos durch', () => {
    const skill = def({ drivers: ['A', 'G'], cars: { scale: '1:32', mode: 'skill', pool: ['Langsam', 'Schnell'], fixed: {} }, sections: [newSection('races', { id: 'r', rounds: 1 })] })
    const s = computeEvent(skill, { ...ctx(), car: (c) => (c === 'Schnell' ? 50 : 0) })
    expect(s.heats[0].cars).toEqual({ G: 'Schnell', A: 'Langsam' })
    const random = def({ drivers: ['A', 'B'], cars: { scale: '1:32', mode: 'random', pool: ['X', 'Y'], fixed: {} }, sections: [newSection('races', { id: 'r', rounds: 2 })] })
    const r = computeEvent(random, ctx())
    expect(r.heats[0].cars.A).not.toBe(r.heats[0].cars.B)
    expect(r.heats[1].cars.A).not.toBe(r.heats[0].cars.A)
  })

  it('übernimmt manuelle Änderungen an einem Lauf', () => {
    const d = def({ drivers: ['A', 'B', 'C'], sections: [newSection('races', { id: 'r', rounds: 1 })], overrides: { 'r-r1-1': { drivers: ['A', 'C'], cars: { A: 'Ferrari' } } } })
    const s = computeEvent(d, ctx())
    expect(s.heats[0].entrants.map((e) => e.name)).toEqual(['A', 'C'])
    expect(s.heats[0].cars.A).toBe('Ferrari')
  })

  it('„Wie gefahren“ nimmt alle Dateien', () => {
    const d = def({ drivers: [], sections: [newSection('free', { id: 'f' })] })
    const s = computeEvent(d, ctx([run('race', ['A', 'B']), run('race', ['B', 'A']), run('race', ['B', 'A'])]))
    expect(s.heats).toHaveLength(3)
    expect(s.standings[0].name).toBe('B')
  })
})

describe('Ansicht', () => {
  const d = def({ sections: [newSection('quali', { id: 'q', maxPerHeat: 1 }), newSection('ladder', { id: 'l' })] })

  it('Sichtbarkeit und Phase', () => {
    expect(planVisible({ ...d, showPlan: 'day' }, '2026-05-30')).toBe(false)
    expect(planVisible({ ...d, showPlan: 'day' }, '2026-05-31')).toBe(true)
    const s = computeEvent(d, ctx())
    expect(eventPhase(d, s, '2026-05-01')).toBe('planned')
    expect(eventPhase(d, s, '2026-06-01')).toBe('running')
    expect(eventPhase(d, s, '2026-06-02')).toBe('done')
  })

  it('erklärt, was ein Fahrer braucht', () => {
    const quali = ['F', 'E', 'D', 'C', 'B', 'A'].map((n, i) => run('quali', [n], { best: [10000 + (5 - i) * 10] }))
    const s = computeEvent(d, ctx(quali))
    const ins = driverInsight(s, 'C')
    expect(ins.nextHeat?.label).toBe('Rennen 1')
    expect(ins.needs.join(' ')).toMatch(/Top 2/)
    expect(Array.isArray(storylines(s))).toBe(true)
  })

  it('Probelauf schätzt Läufe, Dauer und Siegchancen', () => {
    const sim = simulate(d, ctx(), 10000, 30)
    expect(sim.heats).toBe(6 + 2)
    expect(sim.minutes).toBeGreaterThan(10)
    const sum = [...sim.winChance.values()].reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1)
    expect(sim.winChance.get('A') ?? 0).toBeGreaterThan(sim.winChance.get('F') ?? 0)
  })
})
