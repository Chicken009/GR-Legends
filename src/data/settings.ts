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
  /** Zeile im Tab „Fahrer“ je Fahrer-Schlüssel (für Hinweise ohne Namen) */
  rows?: Record<string, number>
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
  const out: Settings = { aliases: {}, guests: [], cars: {}, corrections: [], labels: {}, rows: {} }
  ;(tabs.fahrer ?? []).forEach((row, i) => {
    const [name = '', display = '', guest = ''] = row.map((c) => clean(c ?? ''))
    if (!name || isExample(row)) return
    out.labels![nameKey(name)] = name
    out.rows![nameKey(name)] = i + 2
    if (display && display !== name) out.aliases[nameKey(name)] = display
    if (/^x$/i.test(guest)) out.guests.push(nameKey(name))
  })
  // Ketten auflösen: „Smartrace-Name → Fahrer 01“ und „Fahrer 01 → Anzeigename“ ergeben „Smartrace-Name → Anzeigename“
  for (const key of Object.keys(out.aliases)) {
    let target = out.aliases[key]
    const seen = new Set([key])
    while (out.aliases[nameKey(target)] && !seen.has(nameKey(target))) {
      seen.add(nameKey(target))
      target = out.aliases[nameKey(target)]
    }
    out.aliases[key] = target
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

/** Pseudonym wie in Smartrace, z. B. „Fahrer 12“ */
const PSEUDONYM = /^fahrer\s*\d+$/i

/**
 * Fahrer, die im Sheet eingetragen sind, aber noch kein Rennen gefahren haben – sie bekommen schon
 * ein Profil (z. B. für die Challenges). Angezeigt wird immer der Anzeigename (Ende der Kette).
 * Nur Zeilen mit Pseudonym („Fahrer 12“) als Smartrace-Namen: Andere Namen ohne Rennen sind meist
 * Tippfehler oder alte echte Namen und dürfen nicht auf der Seite erscheinen.
 */
export function newcomers(sessions: Session[], settings: Settings): string[] {
  // Smartrace-Namen aus den Rennen und die Anzeigenamen, auf die sie zeigen
  const raced = new Set(sessions.flatMap((s) => s.results.flatMap((r) => [nameKey(r.driver), nameKey(settings.aliases[nameKey(r.driver)] ?? r.driver)])))
  for (const c of settings.corrections) raced.add(nameKey(settings.aliases[nameKey(c.correctDriver)] ?? c.correctDriver))
  const guests = new Set(settings.guests)
  const out = new Map<string, string>()
  for (const [key, label] of Object.entries(settings.labels ?? {})) {
    if (guests.has(key)) continue
    const target = settings.aliases[key] ?? label
    if (!PSEUDONYM.test(label)) continue
    if (raced.has(key) || raced.has(nameKey(target)) || guests.has(nameKey(target)) || isGuest(target)) continue
    out.set(nameKey(target), target)
  }
  return [...out.values()].sort((a, b) => a.localeCompare(b, 'de', { numeric: true }))
}

/** Einträge im Sheet, die zu keinem Namen in den Rennen passen (meist Tippfehler) */
export function unmatchedSettings(sessions: Session[], settings: Settings): { drivers: number[]; cars: string[] } {
  const drivers = new Set<string>()
  const cars = new Set<string>()
  for (const s of sessions) {
    for (const r of s.results) {
      drivers.add(nameKey(r.driver))
      cars.add(nameKey(r.car))
    }
  }
  for (const c of settings.corrections) drivers.add(nameKey(c.correctDriver))
  // Anzeigenamen, die in den Rennen vorkommen: Einträge, die auf so einen Namen zeigen, sind gewollte
  // Zusammenführungen (z. B. alter Smartrace-Name → Fahrer 01) und kein Tippfehler
  const shown = new Set([...drivers].map((k) => nameKey(settings.aliases[k] ?? settings.labels?.[k] ?? k)))
  // Neue Fahrer ohne Rennen sind gewollt (eigenes Profil) und kein Tippfehler
  const fresh = new Set(newcomers(sessions, settings).map(nameKey))
  const unused = (k: string) => !drivers.has(k) && !(settings.aliases[k] && shown.has(nameKey(settings.aliases[k]))) && !fresh.has(nameKey(settings.aliases[k] ?? settings.labels?.[k] ?? k))
  return {
    // Nur Zeilennummern – Namen aus dem Sheet sollen nicht öffentlich auf der Seite erscheinen
    drivers: [...new Set([...Object.keys(settings.aliases), ...settings.guests])].filter(unused).map((k) => settings.rows?.[k] ?? 0).filter((r) => r > 0).sort((a, b) => a - b),
    cars: Object.entries(settings.cars).filter(([k]) => !cars.has(k)).map(([k, e]) => e.name ?? k),
  }
}
