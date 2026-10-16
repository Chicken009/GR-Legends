import { describe, expect, it } from 'vitest'
import { lapSpeedKmh, parseTrack } from '../data/parseTrack'
import { fixtureIds, readFixture } from '../test-utils'
import type { Result, Session, SourceFile } from '../types'
import { canonicalDriver, isGuest } from './drivers'
import { classifyAllLaps } from './laps'
import { buildSession, dropDuplicates, groupRaceDays } from './sessions'

function fixtureSessions(trackOf: (name: string) => string = () => 'Test'): Session[] {
  return fixtureIds().map((id, i) => {
    const { name, text } = readFixture(id)
    const time = new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString()
    const file: SourceFile = { id, name, track: trackOf(name), createdTime: time, modifiedTime: time }
    return buildSession(file, text)!
  })
}

/** 2022 wurde (nach Rundenzeiten) auf einer anderen Strecke gefahren */
const byYear = (name: string) => (name.includes('2022') ? 'Strecke 2022' : 'Strecke 2025')

const find = (sessions: Session[], id: string) => sessions.find((s) => s.fileId === id)!

function result(driver: string, car: string, laps: number[]): Result {
  return {
    position: 1,
    gap: { kind: 'leader' },
    driver,
    car,
    laps: laps.length,
    bestLapMs: Math.min(...laps),
    validBestLapMs: Math.min(...laps),
    pitStops: 0,
    lapTimes: laps.map((ms, i) => ({ number: i + 1, ms, status: 'normal' })),
  }
}

function session(fileId: string, results: Result[]): Session {
  const t = '2026-01-01T00:00:00.000Z'
  return {
    fileId,
    fileName: 'Rennen_01.01.2026.csv',
    track: 'X',
    trackLengthCm: null,
    date: '2026-01-01',
    type: 'Rennen',
    createdTime: t,
    modifiedTime: t,
    heat: 1,
    results,
  }
}

describe('classifyAllLaps', () => {
  it('markiert per Hand eingesetzte Autos als ungültig und ignoriert sie für die Bestzeit', () => {
    for (const trackOf of [byYear, () => 'Unbekannt']) {
      const results = find(classifyAllLaps(fixtureSessions(trackOf)), '1178732c').results
      const p3 = results[2]
      expect(p3.lapTimes.map((l) => l.status)).toEqual(['crash', 'invalid'])
      expect(p3.bestLapMs).toBe(6_611)
      expect(p3.validBestLapMs).toBe(42_528)
      // die echten Bestzeiten bleiben gültig
      expect(results[0].validBestLapMs).toBe(13_982)
      expect(results[1].validBestLapMs).toBe(13_539)
    }
  })

  it('filtert in keinem anderen Lauf eine Bestzeit', () => {
    for (const trackOf of [byYear, () => 'Unbekannt']) {
      for (const s of classifyAllLaps(fixtureSessions(trackOf))) {
        for (const r of s.results) {
          if (s.fileId === '1178732c' && r.position === 3) continue
          expect(r.validBestLapMs, `${s.fileId} P${r.position}`).toBe(r.bestLapMs)
        }
      }
    }
  })

  it('markiert Boxenstopps mit Zeitverlust', () => {
    const [p1] = find(classifyAllLaps(fixtureSessions(byYear)), '18438d5b').results
    expect(p1.lapTimes[1]).toMatchObject({ ms: 27_370, status: 'pit' })
    expect(p1.lapTimes[1].lossMs).toBeGreaterThan(14_000)
    expect(p1.lapTimes[0]).toMatchObject({ ms: 11_683, status: 'normal' })
  })

  it('filtert nur, wenn die Runde unter Auto- UND Fahrerbestzeit liegt', () => {
    const slowCar = Array(10).fill(15_000)
    const fastDriver = [10_100, 10_200, 10_300, 10_400, 10_500]
    const sessions = classifyAllLaps([
      session('a', [result('Langsam', 'Auto A', slowCar)]),
      // Profi im langsamen Auto: deutlich unter Autobestzeit, aber passt zu seiner Fahrerbestzeit
      session('b', [result('Profi', 'Auto A', [10_000])]),
      session('c', [result('Profi', 'Auto B', fastDriver)]),
    ])
    expect(find(sessions, 'b').results[0].lapTimes[0].status).toBe('normal')
  })

  it('zählt bei Gästen nur die Autobestzeit', () => {
    const sessions = classifyAllLaps([
      session('a', [result('Langsam', 'Auto A', Array(10).fill(15_000))]),
      session('b', [result('Gast', 'Auto A', [10_000])]),
      session('c', [result('Gast', 'Auto B', [10_100, 10_200, 10_300, 10_400, 10_500])]),
    ])
    expect(find(sessions, 'b').results[0].lapTimes[0].status).toBe('invalid')
  })

  it('nutzt Aliase für die Fahrer-Referenz', () => {
    const sessions = classifyAllLaps(
      [
        session('a', [result('Langsam', 'Auto A', Array(10).fill(15_000))]),
        session('b', [result('J. Profi', 'Auto A', [10_000])]),
        session('c', [result('Jan Profi', 'Auto B', [10_100, 10_200, 10_300, 10_400, 10_500])]),
      ],
      { 'J. Profi': 'Jan Profi' },
    )
    expect(find(sessions, 'b').results[0].lapTimes[0].status).toBe('normal')
  })
})

describe('groupRaceDays', () => {
  const sessions = fixtureSessions()

  it('gruppiert nach Tag, neueste zuerst, und nummeriert Läufe pro Typ', () => {
    const days = groupRaceDays(sessions)
    expect(days.map((d) => d.date)).toEqual([
      '2026-03-20',
      '2026-02-07',
      '2025-12-21',
      '2025-08-10',
      '2022-02-05',
    ])
    const feb7 = days[1].sessions.map((s) => `${s.type} ${s.heat}`)
    expect(feb7).toEqual([
      'Qualifikation 1',
      'Qualifikation 2',
      'Rennen 1',
      'Rennen 2',
      'Rennen 3',
    ])
  })

  it('trennt gleiche Tage auf verschiedenen Strecken', () => {
    const other = sessions.map((s) => ({ ...s, track: 'Andere', fileId: `${s.fileId}-b` }))
    expect(groupRaceDays([...sessions, ...other])).toHaveLength(10)
  })
})

describe('Strecke', () => {
  it('liest Name und Länge aus dem Ordnernamen', () => {
    expect(parseTrack('Musterring 2364cm')).toEqual({ name: 'Musterring', lengthCm: 2364 })
    expect(parseTrack('Testbahn 1250,5 cm')).toEqual({ name: 'Testbahn', lengthCm: 1250.5 })
    expect(parseTrack('Unbekannte Strecke')).toEqual({
      name: 'Unbekannte Strecke',
      lengthCm: null,
    })
  })

  it('übernimmt die Länge in den Lauf und berechnet die Geschwindigkeit', () => {
    const { name, text } = readFixture('3ccfdd8f')
    const t = '2026-02-07T10:00:00.000Z'
    const session = buildSession(
      { id: 'x', name, track: 'Musterring 2364cm', createdTime: t, modifiedTime: t },
      text,
    )!
    expect(session).toMatchObject({ track: 'Musterring', trackLengthCm: 2364 })
    // 23,64 m in 10,077 s ≈ 8,45 km/h
    expect(lapSpeedKmh(2364, 10_077)).toBeCloseTo(8.445, 2)
  })
})

describe('drivers', () => {
  it('erkennt Gäste und löst Aliase auf', () => {
    expect(isGuest('Gast')).toBe(true)
    expect(isGuest('gast 2')).toBe(true)
    expect(isGuest('Gaston')).toBe(false)
    expect(canonicalDriver(' F. Lorenz ', { 'F. Lorenz': 'Felix Lorenz' })).toBe('Felix Lorenz')
    expect(canonicalDriver('Mika')).toBe('Mika')
  })
})

describe('dropDuplicates', () => {
  const csv = (car2: string) =>
    [
      'Position;Abstand;Fahrer;Fahrzeug;Runden;Schnellste Runde;Boxenstops;1;2;3;',
      '1;;F. Lorenz;Mercedes C63 AMG DTM;3;0:09.982;0;0:12.001;0:11.365;0:09.982;',
      `2;+0:03.045;Ole;${car2};3;0:10.352;0;0:12.321;0:12.099;0:10.352;`,
    ].join('\n')
  const file = (id: string, name: string, modifiedTime: string) => ({ id, name, track: 'Musterring', createdTime: modifiedTime, modifiedTime })

  it('behält von Original und Kopie nur die zuletzt geänderte Fassung', () => {
    const original = buildSession(file('a', 'Rennen_27.02.2026.csv', '2026-03-01T10:00:00Z'), csv('Mercedes C63 AMG DTM No. 2'))!
    const copy = buildSession(file('b', 'Kopie von Rennen_27.02.2026.csv', '2026-02-28T10:00:00Z'), csv('Mercedes C63 AMG DTM'))!
    const other = buildSession(file('c', 'Rennen_27.02.2026.csv', '2026-02-27T21:00:00Z'), csv('X').replace('0:12.321', '0:12.555'))!
    const kept = dropDuplicates([copy, original, other])
    expect(kept.map((s) => s.fileId)).toEqual(['a', 'c'])
    expect(kept[0].results[1].car).toBe('Mercedes C63 AMG DTM No. 2')
  })
})
