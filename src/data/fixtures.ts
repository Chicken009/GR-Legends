import { UNKNOWN_TRACK } from '../config'
import type { SourceFile } from '../types'

const fixtures = import.meta.glob('/test/fixtures/*/*.csv', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

// Beispiel-Wettkämpfe: `test/events/<Strecke>/<Wettkampf>/…`
const fixtureEvents = import.meta.glob('/test/events/*/*/*.{csv,json}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

// Optional: vollständiger Datenstand in `local-data/<Strecke>/<Datei>.csv` (gitignored),
// Wettkämpfe in `local-data/<Strecke>/<Wettkampf>/…`
const local = import.meta.glob('/local-data/*/*.csv', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const localEvents = import.meta.glob('/local-data/*/*/*.{csv,json}', {
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

export interface FixtureData {
  files: { file: SourceFile; text: string }[]
  events: { name: string; track: string; json: string | null }[]
}

/**
 * Daten für die lokale Entwicklung ohne Drive-Zugang: `local-data/` falls vorhanden, sonst
 * die Testdaten aus `test/fixtures/<id>/<Dateiname>` und `test/events/`. Die Upload-Reihenfolge
 * wird simuliert.
 */
export function loadFixtures(): FixtureData {
  const useLocal = Object.keys(local).length > 0
  const entries = Object.entries(useLocal ? local : fixtures).map(([path, text]) => {
    const [, dir, name] = /\/([^/]+)\/([^/]+)$/.exec(path)!
    return { dir, name, text, track: useLocal ? dir : UNKNOWN_TRACK, event: undefined as string | undefined }
  })
  const eventFiles = Object.entries(useLocal ? localEvents : fixtureEvents).map(([path, text]) => {
    const [, track, event, name] = /\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(path)!
    return { dir: `${track}/${event}`, name, text, track, event }
  })
  const csvs = [...entries, ...eventFiles.filter((f) => /\.csv$/i.test(f.name))]
  csvs.sort((a, b) => orderKey(a.name).localeCompare(orderKey(b.name)) || a.name.localeCompare(b.name))
  const files = csvs.map(({ dir, name, text, track, event }, i) => {
    const time = new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString()
    const id = useLocal || event ? `local-${i}` : dir
    return {
      file: { id, name, track, ...(event ? { event } : {}), createdTime: time, modifiedTime: time },
      text,
    }
  })
  const events = new Map<string, FixtureData['events'][number]>()
  for (const f of eventFiles) {
    const key = `${f.track}/${f.event}`
    const entry = events.get(key) ?? { name: f.event, track: f.track, json: null }
    if (/\.json$/i.test(f.name)) entry.json = f.text
    events.set(key, entry)
  }
  return { files, events: [...events.values()] }
}
