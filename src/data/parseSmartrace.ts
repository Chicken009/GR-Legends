import type { Gap, Result } from '../types'
import { parseTime } from './time'

const FIXED_COLUMNS = [
  'Position',
  'Abstand',
  'Fahrer',
  'Fahrzeug',
  'Runden',
  'Schnellste Runde',
  'Boxenstops',
] as const

export class SmartraceParseError extends Error {}

/** Dekodiert Dateiinhalt als UTF-8, mit Fallback auf Windows-1252 (ältere Exporte). */
export function decodeCsv(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    return new TextDecoder('windows-1252').decode(buffer)
  }
}

export function parseGap(value: string, position: number): Gap {
  const v = value.trim()
  if (!v) return position === 1 ? { kind: 'leader' } : { kind: 'none' }
  const laps = /^\+?(\d+)\s*Runde/i.exec(v)
  if (laps) return { kind: 'laps', laps: Number(laps[1]) }
  const ms = parseTime(v.replace(/^\+/, ''))
  return ms == null ? { kind: 'none' } : { kind: 'time', ms }
}

/**
 * Trennzeichen aus der Kopfzeile: Smartrace nutzt `;`, nach dem Bearbeiten in einer Tabellen-App
 * (z. B. am Handy) steht dort oft `,` oder ein Tabulator.
 */
function detectDelimiter(header: string): string {
  const counts = [';', ',', '\t'].map((d) => [d, header.split(d).length - 1] as const)
  return counts.reduce((best, c) => (c[1] > best[1] ? c : best))[0]
}

/** Zerlegt eine CSV-Zeile; Felder in Anführungszeichen dürfen das Trennzeichen enthalten. */
function splitLine(line: string, delimiter: string): string[] {
  if (!line.includes('"')) return line.split(delimiter)
  const cells: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') quoted = false
      else cur += ch
    } else if (ch === '"') quoted = true
    else if (ch === delimiter) {
      cells.push(cur)
      cur = ''
    } else cur += ch
  }
  cells.push(cur)
  return cells
}

/**
 * Parst eine Smartrace-Ergebnis-CSV (Trennzeichen `;`, auch `,` oder Tabulator).
 * Rundenzeiten werden noch nicht klassifiziert (Status `normal`).
 */
export function parseSmartraceCsv(text: string): Result[] {
  const lines = text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '')
  if (lines.length === 0) throw new SmartraceParseError('Leere Datei')

  const delimiter = detectDelimiter(lines[0])
  const header = splitLine(lines[0], delimiter).map((h) => h.trim())
  const col = Object.fromEntries(FIXED_COLUMNS.map((name) => [name, header.indexOf(name)]))
  const missing = FIXED_COLUMNS.filter((name) => col[name] < 0)
  if (missing.length) {
    throw new SmartraceParseError(`Spalten fehlen: ${missing.join(', ')}`)
  }
  const firstLapCol = col['Boxenstops'] + 1

  return lines.slice(1).map((line) => {
    const cells = splitLine(line, delimiter)
    const get = (name: (typeof FIXED_COLUMNS)[number]) => (cells[col[name]] ?? '').trim()
    const position = Number(get('Position'))
    const lapTimes = cells
      .slice(firstLapCol)
      .map((c) => parseTime(c))
      .filter((ms): ms is number => ms != null)
      .map((ms, i) => ({ number: i + 1, ms, status: 'normal' as const }))
    const bestLapMs = parseTime(get('Schnellste Runde'))

    return {
      position,
      gap: parseGap(get('Abstand'), position),
      driver: get('Fahrer'),
      car: get('Fahrzeug'),
      laps: Number(get('Runden')) || lapTimes.length,
      bestLapMs,
      validBestLapMs: bestLapMs,
      pitStops: Number(get('Boxenstops')) || 0,
      lapTimes,
    }
  })
}
