import { isGuest } from '../domain/drivers'
import type { Session } from '../types'

/** Inhalt des Einstellungen-Sheets im Drive-Ordner (alle Angaben optional). */
export interface Settings {
  /** Name in Smartrace → Anzeigename (gleicher Anzeigename = gleicher Fahrer) */
  aliases: Record<string, string>
  /** Zusätzliche Namen, die wie „Gast“ behandelt werden */
  guests: string[]
  /** Fahrzeugname in Smartrace → Maßstab / Anzeigename */
  cars: Record<string, { scale?: '1:24' | '1:32'; displayName?: string }>
  corrections: Correction[]
}

export interface Correction {
  fileId: string
  position: number
  correctDriver: string
}

export const EMPTY_SETTINGS: Settings = { aliases: {}, guests: [], cars: {}, corrections: [] }

const isExample = (row: string[]) => row.some((c) => /^beispiel/i.test((c ?? '').trim()))

/**
 * Maßstab aus der Tabelle. Google Sheets macht aus „1:24“ gern eine Uhrzeit („01:24:00“),
 * deshalb werden auch diese Schreibweisen sowie „1/24“ und „24“ erkannt.
 */
export function parseScale(value: string): '1:24' | '1:32' | undefined {
  const m = /^0?1\s*[:/]\s*(24|32)(:00)?(\s*(AM|PM))?$/i.exec(value.trim()) ?? /^(24|32)$/.exec(value.trim())
  if (!m) return undefined
  return m[1] === '24' ? '1:24' : '1:32'
}

/** Datei-ID aus einem Drive-Link (…/file/d/<id>/…, ?id=<id>) oder eine nackte ID. */
export function driveFileId(link: string): string | null {
  const s = link.trim()
  const m = /\/d\/([\w-]{10,})/.exec(s) ?? /[?&]id=([\w-]{10,})/.exec(s)
  if (m) return m[1]
  return /^[\w-]{10,}$/.test(s) ? s : null
}

/** Wertet die Zeilen der drei Tabs aus (ohne Kopfzeile). */
export function parseSettings(tabs: { fahrer?: string[][]; fahrzeuge?: string[][]; korrekturen?: string[][] }): Settings {
  const out: Settings = { aliases: {}, guests: [], cars: {}, corrections: [] }
  for (const row of tabs.fahrer ?? []) {
    const [name = '', display = '', guest = ''] = row.map((c) => (c ?? '').trim())
    if (!name || isExample(row)) continue
    if (display && display !== name) out.aliases[name] = display
    if (/^x$/i.test(guest)) out.guests.push(name)
  }
  for (const row of tabs.fahrzeuge ?? []) {
    const [name = '', scale = '', display = ''] = row.map((c) => (c ?? '').trim())
    if (!name || isExample(row)) continue
    const entry: Settings['cars'][string] = {}
    const parsed = parseScale(scale)
    if (parsed) entry.scale = parsed
    if (display && display !== name) entry.displayName = display
    if (entry.scale || entry.displayName) out.cars[name] = entry
  }
  for (const row of tabs.korrekturen ?? []) {
    const [link = '', pos = '', , correct = ''] = row.map((c) => (c ?? '').trim())
    const fileId = driveFileId(link)
    if (!fileId || !correct || isExample(row) || !Number(pos)) continue
    out.corrections.push({ fileId, position: Number(pos), correctDriver: correct })
  }
  return out
}

/**
 * Wendet Korrekturen, Aliase, Gäste und Fahrzeugnamen auf die Läufe an.
 * Als Gast markierte Namen heißen danach „Gast (Name)“.
 */
export function applySettings(sessions: Session[], settings: Settings): Session[] {
  const guests = new Set(settings.guests)
  return sessions.map((s) => ({
    ...s,
    results: s.results.map((r) => {
      const corr = settings.corrections.find((c) => c.fileId === s.fileId && c.position === r.position)
      let driver = corr ? corr.correctDriver : r.driver
      if (guests.has(driver)) driver = isGuest(driver) ? driver : `Gast (${driver})`
      else driver = settings.aliases[driver] ?? driver
      const car = settings.cars[r.car]?.displayName ?? r.car
      return { ...r, driver, car }
    }),
  }))
}

/** Maßstab eines Fahrzeugs (Anzeigename oder Smartrace-Name); Standard 1:32. */
export function carScale(settings: Settings, car: string): number {
  for (const [name, entry] of Object.entries(settings.cars)) {
    if (name === car || entry.displayName === car) return entry.scale === '1:24' ? 24 : 32
  }
  return 32
}
