import { describe, expect, it } from 'vitest'
import type { Result, Session } from '../../types'
import { computeEvent, type EventContext } from './engine'
import { withoutTeams } from './insights'
import { normalizeEvent } from './normalize'
import { eventProgress, heatPointsExplained, myRecap, placePoints, pointsHistory, recapFacts, recapMoments, waitFor } from './progress'
import { newSection } from './templates'

const ELO: Record<string, number> = { A: 700, B: 650, C: 600, D: 550 }
const ctx = (sessions: Session[] = []): EventContext => ({ sessions, elo: (n) => ELO[n] ?? 500, car: () => 0, previousBest: () => null })

let t = 0
function race(order: string[], gapMs = 500): Session {
  t++
  const time = new Date(Date.UTC(2026, 5, 1, 18, t)).toISOString()
  const results: Result[] = order.map((driver, i) => ({
    position: i + 1,
    gap: i === 0 ? { kind: 'leader' } : { kind: 'time', ms: gapMs * i },
    driver,
    car: `Auto ${driver}`,
    laps: 10,
    bestLapMs: 10000 + i * 100,
    validBestLapMs: 10000 + i * 100,
    pitStops: 0,
    lapTimes: [],
  }))
  return { fileId: `p${t}`, fileName: 'Rennen_01.06.2026.csv', track: 'Test', trackLengthCm: null, date: '2026-06-01', type: 'Rennen', createdTime: time, modifiedTime: time, heat: 1, results }
}

// 4 Fahrer, 2 auf der Bahn, 2 Durchgänge = 4 Rennen
const def = normalizeEvent({ name: 'Test-Cup', start: '2026-06-01', drivers: ['A', 'B', 'C', 'D'], maxPerHeat: 2, sections: [newSection('races', { id: 'r', rounds: 2, seeding: 'elo', laps: 10 })] })

/** Läufe nacheinander fahren: jeweils gewinnt, wer in `winners` zuerst kommt */
function play(winners: string[], count: number) {
  const sessions: Session[] = []
  for (let i = 0; i < count; i++) {
    const next = computeEvent(def, ctx(sessions)).next!
    const names = next.entrants.map((e) => e.name!)
    sessions.push(race([...names].sort((a, b) => winners.indexOf(a) - winners.indexOf(b)), i === 1 ? 80 : 500))
  }
  return sessions
}

describe('Punkteverlauf und Rückblick', () => {
  it('rechnet den Stand nach jedem Lauf nach', () => {
    const sessions = play(['D', 'C', 'B', 'A'], 4)
    const steps = pointsHistory(def, ctx(sessions))
    expect(steps.length).toBe(5)
    expect(steps[0].label).toBe('Start')
    expect([...steps[0].totals.values()].every((v) => v === 0)).toBe(true)
    const final = computeEvent(def, ctx(sessions))
    for (const s of final.standings) expect(steps[4].totals.get(s.name)).toBe(s.total)
  })

  it('findet besondere Momente', () => {
    const sessions = play(['D', 'C', 'B', 'A'], 4)
    const state = computeEvent(def, ctx(sessions))
    const steps = pointsHistory(def, ctx(sessions))
    const text = recapMoments(state, steps).map((m) => m.text).join('\n')
    expect(text).toMatch(/D gewinnt mit/)
    const facts = recapFacts(state, steps)
    expect(facts.closest?.ms).toBe(80)
    expect(facts.leaders.length).toBe(4)
    const mine = myRecap(state, steps, 'D')
    expect(mine.heats.length).toBe(2)
    expect(mine.best?.place).toBe(1)
  })

  it('schätzt, wann man dran ist', () => {
    const state = computeEvent(def, ctx())
    const first = state.heats[0].entrants.map((e) => e.name!)
    const later = state.drivers.find((d) => !first.includes(d))!
    expect(waitFor(state, first[0], 10000)?.ahead).toBe(0)
    const w = waitFor(state, later, 10000)!
    expect(w.ahead).toBe(1)
    // Lauf davor: 10 Runden × 10 s × 1,1 ≈ 1,8 Min.; Wechsel: 1 + 2 neue Fahrer × 1 + 2 neue Autos × 0,5 = 4 Min.
    expect(w.minutes).toBe(6)
    // Läufe: A–D, B–C, B–C, D–A. 4 × 1,8 Min. + Wechsel 4 + 1 (gleiches Paar bleibt sitzen) + 4 Min.
    expect(eventProgress(state, 10000)).toEqual({ done: 0, total: 4, minutesLeft: 16 })
    // Nach dem ersten Lauf zählt der Wechsel vom gefahrenen Lauf zum nächsten mit
    const after = computeEvent(def, ctx(play(['D', 'C', 'B', 'A'], 1)))
    expect(waitFor(after, after.next!.entrants[0].name!, 10000)?.minutes).toBe(4)
  })

  it('erklärt die Punkte eines Laufs', () => {
    const sessions = play(['D', 'C', 'B', 'A'], 1)
    const state = computeEvent(def, ctx(sessions))
    const heat = state.heats[0]
    const lines = heatPointsExplained(state, heat, heat.order[0])
    expect(lines.join(' ')).toMatch(/1 Gegner dahinter/)
    expect(lines.join(' ')).toMatch(/Siegbonus/)
    expect(placePoints(def, 4)).toEqual([4, 2, 1, 0])
  })

  it('lässt die Teampaarung im Lauf-Hinweis weg', () => {
    const teams = ['Team Rot', 'Team Blau', 'Team Grün']
    expect(withoutTeams('Team Blau gegen Team Grün', teams)).toBeNull()
    expect(withoutTeams('Team Rot gegen Team Blau · Aufstellung 1 von 2 · Durchgang 2', teams)).toBe('Aufstellung 1 von 2 · Durchgang 2')
    expect(withoutTeams('Einsatz 2 von 3: Team Rot gegen Team Blau', teams)).toBe('Einsatz 2 von 3')
    expect(withoutTeams('Top 2 steigen auf', teams)).toBe('Top 2 steigen auf')
  })
})
