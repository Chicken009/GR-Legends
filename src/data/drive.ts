import { UNKNOWN_TRACK } from '../config'
import type { SourceFile } from '../types'
import { decodeCsv } from './parseSmartrace'

const API = 'https://www.googleapis.com/drive/v3/files'
const FOLDER_MIME = 'application/vnd.google-apps.folder'

/**
 * Google drosselt viele gleichzeitige Anfragen (403 „rate limit“, 429). Beim ersten Besuch ist
 * noch nichts zwischengespeichert und alle CSVs werden geladen – deshalb höchstens wenige
 * Anfragen gleichzeitig und bei Drosselung, Serverfehler oder Netzproblem kurz warten und
 * nochmal versuchen.
 */
const MAX_PARALLEL = 6
const RETRIES = 4
let running = 0
const waiting: (() => void)[] = []

async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= MAX_PARALLEL) await new Promise<void>((resolve) => waiting.push(resolve))
  running++
  try {
    return await fn()
  } finally {
    running--
    waiting.shift()?.()
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const retryable = (status: number) => status === 403 || status === 429 || status >= 500

export async function driveFetch(url: string): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    let res: Response | null = null
    try {
      res = await slot(() => fetch(url))
    } catch (err) {
      if (attempt >= RETRIES) throw err
    }
    if (res && (res.ok || !retryable(res.status) || attempt >= RETRIES)) return res
    // 0,5 s, 1 s, 2 s, 4 s – mit etwas Zufall, damit nicht alle gleichzeitig wiederkommen
    await sleep(500 * 2 ** attempt * (0.75 + Math.random() * 0.5))
  }
}

interface DriveFile {
  id: string
  name: string
  mimeType: string
  createdTime: string
  modifiedTime: string
}

async function listChildren(folderId: string, apiKey: string): Promise<DriveFile[]> {
  const files: DriveFile[] = []
  let pageToken: string | undefined
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, mimeType, createdTime, modifiedTime)',
      pageSize: '1000',
      key: apiKey,
    })
    if (pageToken) params.set('pageToken', pageToken)
    const res = await driveFetch(`${API}?${params}`)
    if (!res.ok) throw new Error(`Drive-Ordner konnte nicht gelesen werden (${res.status})`)
    const body = (await res.json()) as { files: DriveFile[]; nextPageToken?: string }
    files.push(...body.files)
    pageToken = body.nextPageToken
  } while (pageToken)
  return files
}

const SHEET_MIME = 'application/vnd.google-apps.spreadsheet'
// „Fotos“, „Fahrzeugfotos“, „Bilder“, „Autobilder“ …
const PHOTO_FOLDER = /(fotos?|bilder?|photos?|pictures?)$/i

const isCsv = (f: DriveFile) => f.mimeType !== FOLDER_MIME && /\.csv$/i.test(f.name)
const isJson = (f: DriveFile) => f.mimeType !== FOLDER_MIME && /\.json$/i.test(f.name)
const isImage = (f: DriveFile) => f.mimeType.startsWith('image/')

const toSource = (f: DriveFile, track: string, event?: string): SourceFile => ({
  id: f.id,
  name: f.name,
  track,
  ...(event ? { event } : {}),
  createdTime: f.createdTime,
  modifiedTime: f.modifiedTime,
})

/** Wettkampf-Ordner im Streckenordner, mit der zuletzt geänderten `wettkampf.json` */
export interface EventSource {
  name: string
  track: string
  json: SourceFile | null
}

export interface DriveListing {
  files: SourceFile[]
  /** Google-Tabelle mit „Einstellungen“ im Namen (im Hauptordner) */
  settingsSheetId: string | null
  /** Einstellungen-Datei, die keine Google-Tabelle ist (z. B. hochgeladene Excel-Datei) */
  settingsNotSheet: boolean
  /** Fahrzeugfotos aus dem Unterordner „Fotos“: vereinfachter Dateiname (`photoKey`) → Datei-ID */
  photos: Record<string, string>
  events: EventSource[]
}

/** Vereinfachter Name für den Foto-Abgleich: „Ferrari 458.JPG“ und „ferrari_458“ → „ferrari458“ */
export const photoKey = (name: string) =>
  name
    .replace(/\.(jpe?g|png|webp|gif|heic|heif|avif)$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]/g, '')

/** Öffentliches Vorschaubild einer Drive-Datei */
export const drivePhotoUrl = (id: string, width = 1000) => `https://drive.google.com/thumbnail?id=${id}&sz=w${width}`

/** Foto über die Drive API laden (Ausweichweg, falls das Vorschaubild blockiert ist) */
export async function downloadDrivePhoto(id: string, apiKey: string): Promise<string> {
  const res = await fetch(`${API}/${id}?alt=media&key=${encodeURIComponent(apiKey)}`)
  if (!res.ok) throw new Error(`Foto konnte nicht geladen werden (${res.status})`)
  return URL.createObjectURL(await res.blob())
}

/** Inhalt eines Streckenordners: CSVs und Wettkampf-Ordner (eine Ebene tiefer) */
async function listTrackFolder(folder: DriveFile, apiKey: string): Promise<{ files: SourceFile[]; events: EventSource[] }> {
  const children = await listChildren(folder.id, apiKey)
  const eventFolders = children.filter((f) => f.mimeType === FOLDER_MIME)
  const events = await Promise.all(
    eventFolders.map(async (ev) => {
      const inner = await listChildren(ev.id, apiKey)
      const json = inner.filter(isJson).sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime))[0]
      return {
        files: inner.filter(isCsv).map((f) => toSource(f, folder.name, ev.name)),
        event: { name: ev.name.trim(), track: folder.name, json: json ? toSource(json, folder.name, ev.name) : null },
      }
    }),
  )
  return {
    files: [...children.filter(isCsv).map((f) => toSource(f, folder.name)), ...events.flatMap((e) => e.files)],
    events: events.map((e) => e.event),
  }
}

/**
 * Listet alle CSVs im Hauptordner, in den Strecken-Unterordnern und in deren Wettkampf-Ordnern,
 * dazu das Einstellungen-Sheet und die Fahrzeugfotos.
 */
export async function listDriveFiles(folderId: string, apiKey: string): Promise<DriveListing> {
  const root = await listChildren(folderId, apiKey)
  const folders = root.filter((f) => f.mimeType === FOLDER_MIME)
  const photoFolders = folders.filter((f) => PHOTO_FOLDER.test(f.name.trim()))
  const trackFolders = folders.filter((f) => !photoFolders.includes(f))
  const [nested, photoFiles] = await Promise.all([
    Promise.all(trackFolders.map((folder) => listTrackFolder(folder, apiKey))),
    Promise.all(photoFolders.map(async (folder) => (await listChildren(folder.id, apiKey)).filter(isImage))),
  ])
  const photos: Record<string, string> = {}
  for (const f of photoFiles.flat()) photos[photoKey(f.name)] = f.id
  const sheet = root.find((f) => f.mimeType === SHEET_MIME && /einstellungen/i.test(f.name))
  return {
    files: [...root.filter(isCsv).map((f) => toSource(f, UNKNOWN_TRACK)), ...nested.flatMap((n) => n.files)],
    settingsSheetId: sheet?.id ?? null,
    settingsNotSheet: !sheet && root.some((f) => f.mimeType !== FOLDER_MIME && /einstellungen/i.test(f.name)),
    photos,
    events: nested.flatMap((n) => n.events),
  }
}

/** Liest die Tabs Fahrer, Fahrzeuge und Korrekturen (ohne Kopfzeile) über die Sheets API. */
export async function readSettingsSheet(sheetId: string, apiKey: string) {
  const tabs = ['Fahrer', 'Fahrzeuge', 'Korrekturen'] as const
  const params = new URLSearchParams({ key: apiKey })
  for (const t of tabs) params.append('ranges', `${t}!A2:F`)
  const res = await driveFetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchGet?${params}`)
  if (!res.ok) throw new Error(`Einstellungen konnten nicht gelesen werden (${res.status})`)
  const body = (await res.json()) as { valueRanges: { values?: string[][] }[] }
  const [fahrer, fahrzeuge, korrekturen] = body.valueRanges.map((r) => r.values ?? [])
  return { fahrer, fahrzeuge, korrekturen }
}

const CACHE_PREFIX = 'gr-legends:file:'

/** Lädt eine Datei (CSV oder JSON); Inhalt wird pro `modifiedTime` im localStorage zwischengespeichert. */
export async function downloadDriveFile(file: SourceFile, apiKey: string): Promise<string> {
  const cacheKey = `${CACHE_PREFIX}${file.id}:${file.modifiedTime}`
  try {
    const cached = localStorage.getItem(cacheKey)
    if (cached != null) return cached
  } catch {
    // localStorage nicht verfügbar – ohne Cache weiter
  }

  const res = await driveFetch(`${API}/${file.id}?alt=media&key=${encodeURIComponent(apiKey)}`)
  if (!res.ok) throw new Error(`${file.name} konnte nicht geladen werden (${res.status})`)
  const text = decodeCsv(await res.arrayBuffer())

  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (key?.startsWith(`${CACHE_PREFIX}${file.id}:`)) localStorage.removeItem(key)
    }
    localStorage.setItem(cacheKey, text)
  } catch {
    // Speicher voll oder gesperrt – egal
  }
  return text
}
