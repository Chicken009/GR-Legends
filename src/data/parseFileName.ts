import type { SessionType } from '../types'

export interface FileNameInfo {
  type: SessionType
  /** ISO-Datum YYYY-MM-DD */
  date: string
}

// Zusätze nach dem Datum (z. B. „(1)“ von Downloads) werden ignoriert
const FILE_RE = /^(.+?)_(\d{1,2})\.(\d{1,2})\.(\d{4})\b.*\.csv$/i

/** Liest Typ und Datum aus Dateinamen wie `Rennen_07.02.2026.csv`. */
export function parseFileName(name: string): FileNameInfo | null {
  const m = FILE_RE.exec(name.trim())
  if (!m) return null
  const [, type, day, month, year] = m
  return {
    type: type.trim(),
    date: `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`,
  }
}
