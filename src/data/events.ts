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
 * Namen in einer Wettkampf-Definition auf die Anzeigenamen aus dem Einstellungen-Sheet bringen.
 * So bleibt ein Wettkampf gültig, wenn dort z. B. Initialen stehen und später ein Anzeigename dazukommt.
 */
export function renameEventDrivers(def: EventDef, rename: (name: string) => string): EventDef {
  const list = (xs: string[]) => [...new Set(xs.map(rename))]
  const keys = (rec: Record<string, string>) => Object.fromEntries(Object.entries(rec).map(([k, v]) => [rename(k), v]))
  const cars = (rule: EventDef['cars']) => ({ ...rule, fixed: keys(rule.fixed) })
  return {
    ...def,
    drivers: list(def.drivers),
    cars: cars(def.cars),
    teams: def.teams ? { ...def.teams, teams: def.teams.teams.map((t) => ({ ...t, drivers: list(t.drivers) })) } : null,
    sections: def.sections.map((s) => ({ ...s, ...(s.cars ? { cars: cars(s.cars) } : {}), ...(s.heats ? { heats: s.heats.map((h) => ({ ...h, drivers: h.drivers.map(rename) })) } : {}) })),
    overrides: Object.fromEntries(Object.entries(def.overrides).map(([id, o]) => [id, { ...o, ...(o.drivers ? { drivers: o.drivers.map(rename) } : {}), ...(o.cars ? { cars: keys(o.cars) } : {}) }])),
  }
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
