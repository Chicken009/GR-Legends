import { isGuest } from '../domain/drivers'
import type { Session } from '../types'

/** Inhalt des Einstellungen-Sheets im Drive-Ordner (alle Angaben optional). */
export interface Settings {
  /** Name in Smartrace (Schlüssel per `nameKey`) → Anzeigename (gleicher Anzeigename = gleicher Fahrer) */
  aliases: Record<string, string>
  /** Zusätzliche Namen (per `nameKey`), die wie „Gast“ behandelt werden */
  guests: string[]
  /** Fahrzeugname in Smartrace (Schlüssel per `nameKey`) → Name wie im Sheet, Maßstab, Anzeigename */
  cars: Record<string, { name?: string; scale?: '1:24' | '1:32'; displayName?: string }>
  corrections: Correction[]
  /** Schreibweise im Sheet je Fahrer-Schlüssel (für Hinweise) */
  labels?: Record<string, string>
}

export interface Correction {
  fileId: string
  position: number
  correctDriver: string
}

export const EMPTY_SETTINGS: Settings = { aliases: {}, guests: [], cars: {}, corrections: [] }

/**
 * Vergleichsschlüssel für Namen aus dem Sheet und aus Smartrace: Groß-/Kleinschreibung, doppelte
 * und geschützte Leerzeichen spielen keine Rolle. Wichtig, weil der Browser doppelte Leerzeichen
 * einfach anzeigt – wer den Namen aus der App abschreibt, trifft sonst den Smartrace-Namen nicht.
 */
export const nameKey = (name: string) => name.normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('de-DE')
const clean = (name: string) => name.normalize('NFKC').replace(/\s+/g, ' ').trim()

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
  const out: Settings = { aliases: {}, guests: [], cars: {}, corrections: [], labels: {} }
  for (const row of tabs.fahrer ?? []) {
    const [name = '', display = '', guest = ''] = row.map((c) => clean(c ?? ''))
    if (!name || isExample(row)) continue
    out.labels![nameKey(name)] = name
    if (display && display !== name) out.aliases[nameKey(name)] = display
    if (/^x$/i.test(guest)) out.guests.push(nameKey(name))
  }
  for (const row of tabs.fahrzeuge ?? []) {
    const [name = '', scale = '', display = ''] = row.map((c) => clean(c ?? ''))
    if (!name || isExample(row)) continue
    const entry: Settings['cars'][string] = {}
    const parsed = parseScale(scale)
    if (parsed) entry.scale = parsed
    if (display && display !== name) entry.displayName = display
    if (entry.scale || entry.displayName) out.cars[nameKey(name)] = { ...entry, name }
  }
  for (const row of tabs.korrekturen ?? []) {
    const [link = '', pos = '', , correct = ''] = row.map((c) => (c ?? '').trim())
    const fileId = driveFileId(link)
    if (!fileId || !correct || isExample(row) || !Number(pos)) continue
    out.corrections.push({ fileId, position: Number(pos), correctDriver: clean(correct) })
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
      let driver = clean(corr ? corr.correctDriver : r.driver)
      if (guests.has(nameKey(driver))) driver = isGuest(driver) ? driver : `Gast (${driver})`
      else driver = settings.aliases[nameKey(driver)] ?? driver
      const car = settings.cars[nameKey(r.car)]?.displayName ?? clean(r.car)
      return { ...r, driver, car }
    }),
  }))
}

/** Maßstab eines Fahrzeugs (Anzeigename oder Smartrace-Name); Standard 1:32. */
export function carScale(settings: Settings, car: string): number {
  const key = nameKey(car)
  for (const [name, entry] of Object.entries(settings.cars)) {
    if (name === key || (entry.displayName && nameKey(entry.displayName) === key)) return entry.scale === '1:24' ? 24 : 32
  }
  return 32
}

/** Einträge im Sheet, die zu keinem Namen in den Rennen passen (meist Tippfehler) */
export function unmatchedSettings(sessions: Session[], settings: Settings): { drivers: string[]; cars: string[] } {
  const drivers = new Set<string>()
  const cars = new Set<string>()
  for (const s of sessions) {
    for (const r of s.results) {
      drivers.add(nameKey(r.driver))
      cars.add(nameKey(r.car))
    }
  }
  for (const c of settings.corrections) drivers.add(nameKey(c.correctDriver))
  return {
    drivers: [...new Set([...Object.keys(settings.aliases), ...settings.guests])].filter((k) => !drivers.has(k)).map((k) => settings.labels?.[k] ?? k),
    cars: Object.entries(settings.cars).filter(([k]) => !cars.has(k)).map(([k, e]) => e.name ?? k),
  }
}
