import { eventSlug, normalizeEvent } from '../domain/event/normalize'
import type { EventDef } from '../domain/event/types'
import { parseTrack } from './parseTrack'

/** Ein Wettkampf-Ordner (gleich benannte Ordner in mehreren Streckenordnern gehören zusammen) */
export interface EventFolder {
  id: string
  /** Ordnername */
  name: string
  /** Strecken, in deren Ordner der Wettkampf liegt */
  tracks: string[]
  /** Definition aus `wettkampf.json`; ohne Datei eine einfache Wertung „wie gefahren“ */
  def: EventDef
  /** Keine oder fehlerhafte `wettkampf.json` */
  problem: string | null
}

export interface RawEvent {
  name: string
  track: string
  /** Inhalt der JSON-Datei (null = keine Datei) */
  json: string | null
}

/**
 * Wettkampf-Ordner auswerten. `firstDate` liefert das erste Datum der Läufe im Ordner (für
 * Ordner ohne `wettkampf.json`).
 */
export function resolveEvents(raw: RawEvent[], firstDate: (folder: string) => string | null): EventFolder[] {
  const byId = new Map<string, EventFolder>()
  for (const r of raw) {
    const id = eventSlug(r.name)
    const track = parseTrack(r.track).name
    const existing = byId.get(id)
    if (existing) {
      if (!existing.tracks.includes(track)) existing.tracks.push(track)
      if (!existing.problem || !r.json) continue
    }
    let def: EventDef | null = null
    let problem: string | null = null
    if (r.json != null) {
      try {
        def = normalizeEvent(JSON.parse(r.json), r.name)
      } catch (err) {
        problem = `wettkampf.json konnte nicht gelesen werden: ${err instanceof Error ? err.message : String(err)}`
      }
    } else {
      problem = 'Keine wettkampf.json im Ordner – gewertet wird jeder Lauf, wie er gefahren wurde.'
    }
    // Ohne gültige Definition trotzdem zeigen, damit der Fehler auffällt
    def ??= normalizeEvent({ name: r.name, start: firstDate(r.name) ?? '2000-01-01', sections: [{ id: 'f', format: 'free', name: 'Läufe' }] })
    if (!def.track) def.track = track
    byId.set(id, { id, name: r.name, tracks: existing ? existing.tracks : [track], def, problem })
  }
  return [...byId.values()].sort((a, b) => b.def.start.localeCompare(a.def.start) || a.name.localeCompare(b.name))
}
