import { describe, expect, it } from 'vitest'
import { applySettings, driveFileId, EMPTY_SETTINGS, parseSettings } from '../data/settings'
import { prepare } from '../data/useRaceDays'
import { fixtureIds, readFixture } from '../test-utils'
import type { Result, Session } from '../types'
import { classifyIncidents } from './laps'
import { positionTrace } from './model'
import { computeRatings, RATING, winChances } from './rating'
import { buildSession } from './sessions'

function fixtureSessions(): Session[] {
  return fixtureIds().map((id, i) => {
    const { name, text } = readFixture(id)
    const time = new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString()
    return buildSession({ id, name, track: 'Gintoft Ring 2364cm', createdTime: time, modifiedTime: time }, text)!
  })
}

function race(id: string, date: string, order: [string, string, number][]): Session {
  const results: Result[] = order.map(([driver, car, laps], i) => ({
    position: i + 1,
    gap: i === 0 ? { kind: 'leader' } : { kind: 'laps', laps: order[0][2] - laps },
    driver,
    car,
    laps,
    bestLapMs: 10_000,
    validBestLapMs: 10_000,
    pitStops: 0,
    lapTimes: Array.from({ length: laps }, (_, k) => ({ number: k + 1, ms: 10_000 + i * 200, status: 'normal' as const })),
  }))
  return { fileId: id, fileName: `Rennen_${date}.csv`, track: 'X', trackLengthCm: 2000, date, type: 'Rennen', createdTime: `${date}T00:00:00Z`, modifiedTime: '', heat: 1, results }
}

describe('Wertung', () => {
  it('startet bei 500 und bleibt dreistellig', () => {
    const { model } = prepare(fixtureSessions(), EMPTY_SETTINGS)
    for (const v of model.rating.drivers.values()) {
      expect(v).toBeGreaterThan(100)
      expect(v).toBeLessThan(1000)
    }
  })

  it('belohnt Siege, ignoriert Gäste und zählt Abstände', () => {
    const sessions = [
      race('a', '2026-01-01', [['Anna', 'Auto', 10], ['Ben', 'Auto', 9], ['Gast', 'Auto', 8]]),
      race('b', '2026-01-02', [['Anna', 'Auto', 10], ['Ben', 'Auto', 10]]),
    ]
    const r = computeRatings(sessions)
    expect(r.drivers.get('Anna')!).toBeGreaterThan(RATING.start)
    expect(r.drivers.get('Ben')!).toBeLessThan(RATING.start)
    expect(r.drivers.has('Gast')).toBe(false)
    const [first] = r.history.get('Anna')!
    expect(first.reason).toContain('Sieg vor Ben')
    // Ein Runde Vorsprung bringt mehr als ein knapper Sieg
    const [, second] = r.history.get('Anna')!
    expect(first.delta).toBeGreaterThan(second.delta)
  })

  it('gibt dem Außenseiter im schwächeren Auto mehr Punkte', () => {
    const base = Array.from({ length: 6 }, (_, i) => race(`s${i}`, `2026-01-0${i + 1}`, [['Anna', 'Schnell', 10], ['Ben', 'Lahm', 8]]))
    const before = computeRatings(base)
    const after = computeRatings([...base, race('x', '2026-01-09', [['Ben', 'Lahm', 10], ['Anna', 'Schnell', 9]])])
    const upset = after.history.get('Ben')!.at(-1)!
    expect(upset.delta).toBeGreaterThan(5)
    expect(upset.upsetExpectation).toBeLessThan(0.5)
    expect(before.cars.get('X\u0000Schnell')!).toBeGreaterThan(before.cars.get('X\u0000Lahm')!)
  })

  it('berechnet Siegchancen aus der Wertung', () => {
    const wc = winChances([{ name: 'a', strength: 600 }, { name: 'b', strength: 400 }])
    expect(wc.get('a')).toBeCloseTo(10 / 11, 5)
  })
})

describe('Boxenstopp oder Abflug', () => {
  const lap = (ms: number, i: number) => ({ number: i + 2, ms, status: 'normal' as const })
  it('ordnet ohne Tankfunktion die kleinsten Verluste den Boxenstopps zu', () => {
    const laps = [10_000, 10_100, 15_000, 10_050, 30_000, 10_000].map(lap)
    const out = classifyIncidents(laps, 1, false)
    expect(out.map((l) => l.status)).toEqual(['normal', 'normal', 'pit', 'normal', 'crash', 'normal'])
  })

  it('erkennt mit Tankfunktion den Boxenstopp mit nicht gezählter Runde', () => {
    // 24 s ≈ eine nicht gezählte Runde + 4 s Boxenzeit; 17 s passt nicht zum Muster → Abflug
    const laps = [10_000, 10_100, 17_000, 10_050, 24_000, 10_000].map(lap)
    const out = classifyIncidents(laps, 1, true)
    expect(out[4].status).toBe('pit')
    expect(out[2].status).toBe('crash')
    expect(out[2].lossMs).toBeGreaterThan(6_000)
  })

  it('wertet eine etwas langsamere Startrunde nicht als Abflug', () => {
    const laps = [14_000, 10_000, 10_100, 10_050, 10_000].map((ms, i) => ({ number: i + 1, ms, status: 'normal' as const }))
    expect(classifyIncidents(laps, 0, false)[0].status).toBe('normal')
  })
})

describe('Kennzahlen', () => {
  const { model } = prepare(fixtureSessions(), EMPTY_SETTINGS)

  it('liefert Rangliste, Status und mindestens eine Medaille pro Fahrer', () => {
    const rows = model.ranking('all')
    expect(rows[0].rank).toBe(1)
    expect(rows.every((r, i) => i === 0 || r.elo <= rows[i - 1].elo)).toBe(true)
    expect(model.statuses('all').get(rows[0].name)?.[0].code).toBe('crown')
    for (const r of rows) expect(model.medals.get(r.name)?.length ?? 0, r.name).toBeGreaterThan(0)
  })

  it('zählt Abflüge nur in Rennen ohne Tankfunktion', () => {
    for (const d of model.stats('all').drivers.values()) {
      const nonTankLaps = d.raceResults.filter((x) => !x.session.tank).reduce((a, x) => a + x.result.laps, 0)
      expect(d.crashBaseLaps).toBe(nonTankLaps)
    }
  })

  it('berechnet Kilometer aus der Streckenlänge', () => {
    const d = model.stats('all').drivers.get('Anton Berger')!
    expect(d.km).toBeCloseTo((d.laps * 2364) / 100000, 5)
  })

  it('verfolgt Positionen pro Runde', () => {
    const s = model.sessions.find((x) => x.results.length >= 3 && x.type === 'Rennen')!
    const trace = positionTrace(s)
    const winner = trace.get(`${s.results[0].driver}#1`)!
    expect(winner.at(-1)).toBe(1)
  })
})

describe('Einstellungen', () => {
  it('liest Aliase, Gäste, Fahrzeuge und Korrekturen und überspringt Beispielzeilen', () => {
    const settings = parseSettings({
      fahrer: [['J. Muster', 'Jan Mustermann', '', '', 'Beispiel: …'], ['Jo', 'Mika'], ['Oma', '', 'x'], ['Gast 2', '', 'x']],
      fahrzeuge: [['Porsche', '1:24', '', '', 'Beispiel'], ['Ferrari 458 Italia', '', 'Ferrari 458']],
      korrekturen: [['https://drive.google.com/file/d/abcdefghijk12/view', '2', 'Jo', 'Anton Berger']],
    })
    expect(settings.aliases).toEqual({ Jo: 'Mika' })
    expect(settings.guests).toEqual(['Oma', 'Gast 2'])
    expect(settings.cars).toEqual({ 'Ferrari 458 Italia': { displayName: 'Ferrari 458' } })
    expect(settings.corrections).toEqual([{ fileId: 'abcdefghijk12', position: 2, correctDriver: 'Anton Berger' }])
    expect(driveFileId('https://drive.google.com/open?id=abcdefghijk12')).toBe('abcdefghijk12')

    const [s] = applySettings([race('abcdefghijk12', '2026-01-01', [['Jo', 'Ferrari 458 Italia', 10], ['Jo', 'X', 9], ['Oma', 'X', 8], ['Gast 2', 'X', 7]])], settings)
    expect(s.results.map((r) => r.driver)).toEqual(['Mika', 'Anton Berger', 'Gast (Oma)', 'Gast 2'])
    expect(s.results[0].car).toBe('Ferrari 458')
  })
})
