import { describe, expect, it } from 'vitest'
import type { Result, Session } from '../../types'
import { buildTeams, chunkEven, computeEvent, ladderSizes, snake, type EventContext } from './engine'
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
    const final = s.sections[1].heats[1]
    expect(final.entrants.map((e) => e.name)).toEqual(['E', 'C', 'B', 'A'])
    expect(s.next?.id).toBe(final.id)
    const race2 = run('race', ['C', 'A', 'E', 'B'])
    s = computeEvent(def({ sections }), ctx([...quali, race1, race2]))
    expect(s.complete).toBe(true)
    expect(s.sections[1].ranking.map((r) => r.name)).toEqual(['C', 'A', 'E', 'B', 'D', 'F'])
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
