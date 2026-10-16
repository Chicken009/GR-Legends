import { describe, expect, it } from 'vitest'
import { fixtureIds, readFixture } from '../test-utils'
import { parseFileName } from './parseFileName'
import { decodeCsv, parseGap, parseSmartraceCsv, SmartraceParseError } from './parseSmartrace'
import { formatTime, parseTime } from './time'

describe('parseTime / formatTime', () => {
  it('parst m:ss.mmm', () => {
    expect(parseTime('0:10.077')).toBe(10_077)
    expect(parseTime('4:43.307')).toBe(283_307)
    expect(parseTime('')).toBeNull()
    expect(parseTime('abc')).toBeNull()
  })

  it('formatiert Millisekunden', () => {
    expect(formatTime(10_077)).toBe('10.077')
    expect(formatTime(283_307)).toBe('4:43.307')
    expect(formatTime(null)).toBe('–')
  })
})

describe('parseGap', () => {
  it('erkennt Sieger, Zeitabstand, Rundenabstand und fehlenden Abstand', () => {
    expect(parseGap('', 1)).toEqual({ kind: 'leader' })
    expect(parseGap('', 2)).toEqual({ kind: 'none' })
    expect(parseGap('+0:00.450', 2)).toEqual({ kind: 'time', ms: 450 })
    expect(parseGap('+0:14.537', 2)).toEqual({ kind: 'time', ms: 14_537 })
    expect(parseGap('+6 Runde(n)', 3)).toEqual({ kind: 'laps', laps: 6 })
  })
})

describe('parseFileName', () => {
  it('liest Typ und Datum', () => {
    expect(parseFileName('Rennen_07.02.2026.csv')).toEqual({ type: 'Rennen', date: '2026-02-07' })
    expect(parseFileName('Kopie von Rennen_27.02.2026.csv')).toEqual({ type: 'Rennen', date: '2026-02-27' })
    expect(parseFileName('Copy of Qualifikation_27.02.2026.csv')).toEqual({ type: 'Qualifikation', date: '2026-02-27' })
    expect(parseFileName('Qualifikation_05.02.2022.csv')).toEqual({
      type: 'Qualifikation',
      date: '2022-02-05',
    })
    expect(parseFileName('Training_1.3.2026.csv')).toEqual({ type: 'Training', date: '2026-03-01' })
    expect(parseFileName('Rennen_07.02.2026(1).csv')).toEqual({ type: 'Rennen', date: '2026-02-07' })
    expect(parseFileName('Rennen_07.02.2026 (1).csv')).toEqual({ type: 'Rennen', date: '2026-02-07' })
    expect(parseFileName('Rennen_07.02.20261.csv')).toBeNull()
    expect(parseFileName('notizen.txt')).toBeNull()
  })
})

describe('parseSmartraceCsv', () => {
  it('parst alle Beispieldateien mit konsistenten Rundenzahlen', () => {
    for (const id of fixtureIds()) {
      const { name, text } = readFixture(id)
      expect(parseFileName(name), name).not.toBeNull()
      const results = parseSmartraceCsv(text)
      expect(results.length, name).toBeGreaterThan(0)
      results.forEach((r, i) => {
        expect(r.position, name).toBe(i + 1)
        expect(r.lapTimes.length, `${name} P${r.position}`).toBe(r.laps)
        expect(Math.min(...r.lapTimes.map((l) => l.ms)), `${name} P${r.position}`).toBe(
          r.bestLapMs,
        )
      })
    }
  })

  it('liest ein Ergebnis vollständig', () => {
    const [p1, p2] = parseSmartraceCsv(readFixture('3ccfdd8f').text)
    expect(p1).toMatchObject({
      position: 1,
      gap: { kind: 'leader' },
      driver: 'Anton Berger',
      car: 'Audi RS5 DTM R. Frijns',
      laps: 10,
      bestLapMs: 10_077,
      pitStops: 0,
    })
    expect(p1.lapTimes[2]).toEqual({ number: 3, ms: 31_076, status: 'normal' })
    expect(p2).toMatchObject({ driver: 'Mika', gap: { kind: 'time', ms: 450 }, laps: 8 })
  })

  it('liest Boxenstopps', () => {
    const [p1, p2] = parseSmartraceCsv(readFixture('18438d5b').text)
    expect(p1.pitStops).toBe(8)
    expect(p2.pitStops).toBe(7)
  })

  it('behandelt fehlenden Abstand bei Nicht-Siegern', () => {
    const results = parseSmartraceCsv(readFixture('1178732c').text)
    expect(results.map((r) => r.gap.kind)).toEqual(['leader', 'none', 'laps'])
  })

  it('verkraftet CRLF und BOM', () => {
    const text = '﻿' + readFixture('3ccfdd8f').text.replace(/\n/g, '\r\n')
    expect(parseSmartraceCsv(text)).toHaveLength(2)
  })

  it('meldet fehlende Spalten', () => {
    expect(() => parseSmartraceCsv('Foo;Bar\n1;2')).toThrow(SmartraceParseError)
  })
})

describe('decodeCsv', () => {
  it('dekodiert UTF-8 und fällt auf Windows-1252 zurück', () => {
    expect(decodeCsv(new TextEncoder().encode('Jörg').buffer)).toBe('Jörg')
    expect(decodeCsv(new Uint8Array([0x4a, 0xf6, 0x72, 0x67]).buffer)).toBe('Jörg')
  })
})
