import { UNKNOWN_TRACK } from '../config'
import type { SourceFile } from '../types'

const fixtures = import.meta.glob('/test/fixtures/*/*.csv', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

// Optional: vollständiger Datenstand in `local-data/<Strecke>/<Datei>.csv` (gitignored)
const local = import.meta.glob('/local-data/*/*.csv', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/** Sortierschlüssel für die simulierte Upload-Reihenfolge: Datum, Qualifying zuerst, Download-Nummer. */
function orderKey(name: string): string {
  const m = /^(.+?)_(\d{1,2})\.(\d{1,2})\.(\d{4})\s*(?:\((\d+)\))?/.exec(name)
  if (!m) return name
  const [, type, d, mo, y, n] = m
  return `${y}${mo.padStart(2, '0')}${d.padStart(2, '0')}-${/quali/i.test(type) ? 0 : 1}-${(n ?? '0').padStart(3, '0')}`
}

/**
 * Daten für die lokale Entwicklung ohne Drive-Zugang: `local-data/` falls vorhanden, sonst
 * die Testdaten aus `test/fixtures/<id>/<Dateiname>`. Die Upload-Reihenfolge wird simuliert.
 */
export function loadFixtures(): { file: SourceFile; text: string }[] {
  const useLocal = Object.keys(local).length > 0
  const entries = Object.entries(useLocal ? local : fixtures).map(([path, text]) => {
    const [, dir, name] = /\/([^/]+)\/([^/]+)$/.exec(path)!
    return { dir, name, text }
  })
  entries.sort((a, b) => orderKey(a.name).localeCompare(orderKey(b.name)) || a.name.localeCompare(b.name))
  return entries.map(({ dir, name, text }, i) => {
    const time = new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString()
    const id = useLocal ? `local-${i}` : dir
    return {
      file: { id, name, track: useLocal ? dir : UNKNOWN_TRACK, createdTime: time, modifiedTime: time },
      text,
    }
  })
}
