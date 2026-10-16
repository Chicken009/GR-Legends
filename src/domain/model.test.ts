import { describe, expect, it } from 'vitest'
import { applySettings, driveFileId, EMPTY_SETTINGS, parseScale, parseSettings } from '../data/settings'
import { prepare } from '../data/useRaceDays'
import { fixtureIds, readFixture } from '../test-utils'
import type { Result, Session } from '../types'
import { classifyIncidents, hasTankFunction } from './laps'
import { positionTrace } from './model'
import { computeRatings, RATING, winChances } from './rating'
import { buildSession } from './sessions'

function fixtureSessions(): Session[] {
  return fixtureIds().map((id, i) => {
    const { name, text } = readFixture(id)
    const time = new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString()
    return buildSession({ id, name, track: 'Musterring 2364cm', createdTime: time, modifiedTime: time }, text)!
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

  it('lässt alle steigen, wenn alle schneller werden (Duell gegen die Bahn)', () => {
    const lapRace = (id: string, date: string, ms: number) => {
      const s = race(id, date, [['Anna', 'Auto', 10], ['Ben', 'Auto', 10]])
      return { ...s, results: s.results.map((r) => ({ ...r, lapTimes: r.lapTimes.map((l) => ({ ...l, ms: ms + (r.position - 1) * 50 })) })) }
    }
    // erst langsam, dann deutlich schneller – Platzierungen bleiben gleich
    const sessions = [
      ...Array.from({ length: 6 }, (_, i) => lapRace(`s${i}`, `2026-01-0${i + 1}`, 12_000)),
      ...Array.from({ length: 6 }, (_, i) => lapRace(`f${i}`, `2026-02-0${i + 1}`, 10_500)),
    ]
    const r = computeRatings(sessions)
    const avg = (r.drivers.get('Anna')! + r.drivers.get('Ben')!) / 2
    const atMid = r.history.get('Anna')![5].after / 2 + r.history.get('Ben')![5].after / 2
    expect(avg).toBeGreaterThan(atMid)
    const withoutBench = computeRatings(sessions, { ...RATING, benchWeight: 0 })
    expect((withoutBench.drivers.get('Anna')! + withoutBench.drivers.get('Ben')!) / 2).toBeCloseTo(RATING.start, 0)
  })

  it('berechnet Siegchancen aus der Wertung', () => {
    const wc = winChances([{ name: 'a', strength: 600 }, { name: 'b', strength: 400 }])
    expect(wc.get('a')).toBeCloseTo(10 / 11, 5)
  })
})

describe('Boxenstopp oder Abflug', () => {
  const lap = (ms: number, i: number) => ({ number: i + 2, ms, status: 'normal' as const })
  it('wertet ohne Tankfunktion nur eine kurze Box-Durchfahrt als Stopp', () => {
    const laps = [10_000, 10_100, 14_000, 10_050, 30_000, 10_000].map(lap)
    expect(classifyIncidents(laps, 1, false).map((l) => l.status)).toEqual(['normal', 'normal', 'pit', 'normal', 'crash', 'normal'])
    // Großer Zeitverlust ist ein Abflug, auch wenn Smartrace eine Durchfahrt gezählt hat
    const crashOnly = [10_000, 10_100, 25_000, 10_050, 10_000].map(lap)
    expect(classifyIncidents(crashOnly, 1, false)[2].status).toBe('crash')
  })

  it('erkennt die Tankfunktion an der Mehrheit der Fahrer mit Boxenstopp', () => {
    const withStops = (stops: number[]) => ({ ...race('t', '2026-01-01', stops.map((_, i) => [`F${i}`, 'Auto', 10] as [string, string, number])), results: race('t', '2026-01-01', stops.map((_, i) => [`F${i}`, 'Auto', 10] as [string, string, number])).results.map((r, i) => ({ ...r, pitStops: stops[i] })) })
    expect(hasTankFunction(withStops([2, 3, 1, 2]))).toBe(true)
    expect(hasTankFunction(withStops([1, 1]))).toBe(true)
    // ein Fahrer ist nur durch die Boxengasse gefahren
    expect(hasTankFunction(withStops([0, 1, 0, 0, 0]))).toBe(false)
    expect(hasTankFunction(withStops([1, 0]))).toBe(false)
    expect(hasTankFunction(withStops([0, 0, 0]))).toBe(false)
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
  it('erkennt den Maßstab auch als Uhrzeit aus Google Sheets', () => {
    for (const v of ['1:24', '01:24:00', '1:24:00', '1/24', '24', ' 1 : 24 ']) expect(parseScale(v), v).toBe('1:24')
    for (const v of ['1:32', '01:32:00', '32']) expect(parseScale(v), v).toBe('1:32')
    for (const v of ['', 'x', '1:43', '12:24']) expect(parseScale(v), v).toBeUndefined()
  })

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
