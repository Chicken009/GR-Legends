import { describe, expect, it } from 'vitest'
import type { Lap, Result, Session } from '../../types'
import { computeEvent, type EventContext } from './engine'
import { normalizeEvent } from './normalize'
import { eventNumbers, pointsHistory, recapFacts } from './progress'
import { formatTime } from '../../data/time'
import type { ProgressStep } from './progress'
import { closeFinishes, costliestCrash, driveTimeFun, fastestLaps, headline, heatReplay, mostLaps, moreNumbers, positionChanges, quizQuestions, raceOfDay, replayAt, rivalOf, standingsRace } from './recap'
import { newSection } from './templates'

const DRIVERS = ['Anton Berger', 'Mika', 'Emil', 'Pia S.']
const ELO: Record<string, number> = { 'Anton Berger': 700, Mika: 650, Emil: 600, 'Pia S.': 550 }
const ctx = (sessions: Session[] = []): EventContext => ({ sessions, elo: (n) => ELO[n] ?? 500, car: () => 0, previousBest: () => null })

const lap = (ms: number, status: Lap['status'] = 'normal', lossMs?: number, number = 0): Lap => ({ number, ms, status, lossMs })

let t = 0
/** Rennen aus Rundenzeiten; Reihenfolge und Abstände ergeben sich aus der Gesamtzeit */
function race(laps: Record<string, Lap[]>, trackLengthCm: number | null = 1000): Session {
  t++
  const time = new Date(Date.UTC(2026, 5, 1, 18, t)).toISOString()
  const total = (n: string) => laps[n].reduce((a, l) => a + l.ms, 0)
  const order = Object.keys(laps).sort((a, b) => laps[b].length - laps[a].length || total(a) - total(b))
  const results: Result[] = order.map((driver, i) => {
    const clean = laps[driver].filter((l) => l.status === 'normal').map((l) => l.ms)
    return {
      position: i + 1,
      gap: i === 0 ? { kind: 'leader' } : { kind: 'time', ms: total(driver) - total(order[0]) },
      driver,
      car: `Auto ${i + 1}`,
      laps: laps[driver].length,
      bestLapMs: Math.min(...clean),
      validBestLapMs: Math.min(...clean),
      pitStops: 0,
      lapTimes: laps[driver].map((l, k) => ({ ...l, number: k + 1 })),
    }
  })
  return { fileId: `r${t}`, fileName: 'Rennen_01.06.2026.csv', track: 'Test', trackLengthCm, date: '2026-06-01', type: 'Rennen', createdTime: time, modifiedTime: time, heat: 1, results }
}

const def = normalizeEvent({ name: 'Test-Cup', start: '2026-06-01', drivers: DRIVERS, maxPerHeat: 4, sections: [newSection('races', { id: 'r', rounds: 3, seeding: 'elo', laps: 4 })] })
const n = (ms: number, count: number) => Array.from({ length: count }, () => lap(ms))

// Rennen 1: Emil führt erst, Mika überholt in Runde 3 und gewinnt knapp (0,2 s)
const r1 = race({
  Mika: [lap(10_500), lap(10_000), lap(9_800), lap(9_800)],
  Emil: [lap(10_000), lap(10_100), lap(10_100), lap(10_100)],
  'Anton Berger': n(10_400, 4),
  'Pia S.': [lap(10_300), lap(18_800, 'crash', 8_500), lap(10_300), lap(10_300)],
})
// Rennen 2: Anton klar vorn, keine Wechsel
const r2 = race({ 'Anton Berger': n(9_900, 4), Mika: n(10_200, 4), Emil: n(10_300, 4), 'Pia S.': n(10_500, 4) })
// Rennen 3: Mika vor Anton, Pia ohne Abflug
const r3 = race({ Mika: n(9_950, 4), 'Anton Berger': n(10_000, 4), 'Pia S.': n(10_400, 4), Emil: n(10_450, 4) })
const sessions = [r1, r2, r3]
const state = computeEvent(def, ctx(sessions))
const steps = pointsHistory(def, ctx(sessions))
const heat1 = state.heats.find((h) => h.session?.fileId === r1.fileId)!

describe('Rennwiedergabe', () => {
  it('stellt das Rennen aus den Rundenzeiten nach', () => {
    const r = heatReplay(heat1)!
    expect(r.laps).toBe(4)
    // Nach 1 Runde (10,0 s) liegt Emil vorn, im Ziel Mika
    expect(replayAt(r, 10_050).find((x) => x.rank === 1)?.name).toBe('Emil')
    const end = replayAt(r, r.durationMs)
    expect(end.find((x) => x.rank === 1)?.name).toBe('Mika')
    expect(end.every((x) => x.done)).toBe(true)
    // Abflug von Pia in Runde 2
    expect(replayAt(r, 15_000).find((x) => x.name === 'Pia S.')?.crash).toBe(true)
  })

  it('zählt Positionswechsel und findet das Rennen des Tages', () => {
    expect(positionChanges(heatReplay(heat1)!)).toBeGreaterThanOrEqual(2)
    const rod = raceOfDay(state)!
    expect(rod.heat.id).toBe(heat1.id)
    expect(rod.leadChanges).toBe(1)
  })

  it('ohne Rundenzeiten keine Wiedergabe', () => {
    const bare = { ...heat1, session: { ...heat1.session!, results: heat1.session!.results.map((x) => ({ ...x, lapTimes: [] })) } }
    expect(heatReplay(bare)).toBeNull()
  })
})

describe('Höhepunkte', () => {
  it('knappste Zieleinläufe mit Abstand auf der Strecke und je Runde', () => {
    const [c] = closeFinishes(state)
    expect(c.first).toBe('Mika')
    expect(c.second).toBe('Emil')
    expect(c.ms).toBe(200)
    // 200 ms bei 10,1 s je 1000 cm ≈ 20 cm
    expect(Math.round(c.cm!)).toBe(20)
    expect(c.gaps).toEqual([-500, -400, -100, 200])
  })

  it('schnellste Runden je Fahrer mit Lauf und Runde', () => {
    const laps = fastestLaps(state)
    expect(laps[0]).toMatchObject({ name: 'Mika', ms: 9_800, lap: 3 })
    expect(new Set(laps.map((l) => l.name)).size).toBe(laps.length)
  })

  it('teuerster Abflug', () => {
    const c = costliestCrash(state)!
    expect(c).toMatchObject({ name: 'Pia S.', lap: 2, lossMs: 8_500 })
    // ohne den Verlust wäre Pia vor Anton gewesen, aber nicht vor Emil
    expect(c.places).toBe(1)
  })

  it('Rivale mit Bilanz', () => {
    const rv = rivalOf(state, 'Mika')!
    expect(rv.races.length).toBe(3)
    expect(rv.wins + rv.losses).toBe(3)
  })

  it('Zahlen: Fahrzeit, Autos, Vergleich nur wenn er passt', () => {
    const more = moreNumbers(state)
    expect(more.driveMs).toBeGreaterThan(100_000)
    expect(more.cars).toBe(4)
    expect(driveTimeFun(30 * 60_000)).toBeNull()
    expect(driveTimeFun(180 * 60_000)).toBe('so lang wie 2 Fußballspiele')
    expect(mostLaps([{ name: 'Mika', laps: 10 }, { name: 'Emil', laps: 10 }])).toBeNull()
  })
})

describe('Quiz und Schlagzeile', () => {
  const f = recapFacts(state, steps)
  it('Fragen mit drei verschiedenen Antworten, die richtige ist dabei', () => {
    const qs = quizQuestions(state, f, eventNumbers(state).perDriver, 'x')
    expect(qs.length).toBeGreaterThanOrEqual(2)
    for (const q of qs) {
      expect(new Set(q.options).size).toBe(q.options.length)
      expect(q.options.length).toBe(3)
      expect(q.answer).toBeGreaterThanOrEqual(0)
    }
    const fl = qs.find((q) => q.question.includes('schnellste Runde'))
    if (fl) expect(fl.options[fl.answer]).toBe(state.fastestLap!.name)
    // gleicher Startwert, gleiche Fragen
    expect(quizQuestions(state, f, eventNumbers(state).perDriver, 'x')).toEqual(qs)
  })

  it('Schlagzeile persönlich und allgemein', () => {
    const mine = headline(state, steps, f, 'Mika', true)
    expect(mine.chips[0]).toMatch(/^Platz \d von 4$/)
    const general = headline(state, steps, f, null, true)
    expect(general.title.length).toBeGreaterThan(5)
  })
})

describe('Rennen um die Spitze', () => {
  const stand = (label: string, totals: Record<string, number>): ProgressStep => {
    const names = Object.keys(totals)
    const ranks = new Map(names.map((x) => [x, 1 + names.filter((o) => totals[o] > totals[x]).length]))
    return { heatId: label, heatIds: [label], label, totals: new Map(Object.entries(totals)), ranks, teams: new Map() }
  }
  const path = [
    stand('Start', { A: 0, B: 0, C: 0, D: 0 }),
    stand('L1', { A: 3, B: 3, C: 1, D: 0 }),
    stand('L2', { A: 4, B: 6, C: 4, D: 4 }),
  ]
  it('Gleichstand: gleicher Platz, aber nie dieselbe Zeile', () => {
    const race = standingsRace(path, ['A', 'B', 'C', 'D'], true)
    for (const p of [0, 0.25, 0.5, 0.75, 1]) {
      const rows = race(p)
      if (p === 0.5 || p === 1) expect(new Set(rows.map((r) => r.pos)).size).toBe(4)
      for (const r of rows) expect(r.x).toBeGreaterThanOrEqual(0)
    }
    const end = race(1)
    expect(end.find((r) => r.name === 'B')).toMatchObject({ rank: 1, pos: 1, x: 1 })
    // A, C, D punktgleich auf Platz 2: getrennte Zeilen, Reihenfolge wie vorher
    expect(end.filter((r) => r.rank === 2).map((r) => r.pos).sort()).toEqual([2, 3, 4])
  })

  it('Zeit beim Hochzählen ohne lange Nachkommastellen', () => {
    expect(formatTime(10_299.73)).toBe('10,300 s')
  })
})
