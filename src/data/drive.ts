import { UNKNOWN_TRACK } from '../config'
import type { SourceFile } from '../types'
import { decodeCsv } from './parseSmartrace'

const API = 'https://www.googleapis.com/drive/v3/files'
const FOLDER_MIME = 'application/vnd.google-apps.folder'

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
    const res = await fetch(`${API}?${params}`)
    if (!res.ok) throw new Error(`Drive-Ordner konnte nicht gelesen werden (${res.status})`)
    const body = (await res.json()) as { files: DriveFile[]; nextPageToken?: string }
    files.push(...body.files)
    pageToken = body.nextPageToken
  } while (pageToken)
  return files
}

const SHEET_MIME = 'application/vnd.google-apps.spreadsheet'
const PHOTO_FOLDER = /^(fahrzeug)?fotos$/i

const isCsv = (f: DriveFile) => f.mimeType !== FOLDER_MIME && /\.csv$/i.test(f.name)
const isImage = (f: DriveFile) => f.mimeType.startsWith('image/')

const toSource = (f: DriveFile, track: string): SourceFile => ({
  id: f.id,
  name: f.name,
  track,
  createdTime: f.createdTime,
  modifiedTime: f.modifiedTime,
})

export interface DriveListing {
  files: SourceFile[]
  /** Google-Tabelle mit „Einstellungen“ im Namen (im Hauptordner) */
  settingsSheetId: string | null
  /** Fahrzeugfotos aus dem Unterordner „Fotos“: Dateiname ohne Endung → Bild-URL */
  photos: Record<string, string>
}

/** Öffentliches Vorschaubild einer Drive-Datei */
export const drivePhotoUrl = (id: string) => `https://drive.google.com/thumbnail?id=${id}&sz=w1000`

/**
 * Listet alle CSVs im Hauptordner und in den Strecken-Unterordnern (eine Ebene), dazu das
 * Einstellungen-Sheet und die Fahrzeugfotos.
 */
export async function listDriveFiles(folderId: string, apiKey: string): Promise<DriveListing> {
  const root = await listChildren(folderId, apiKey)
  const folders = root.filter((f) => f.mimeType === FOLDER_MIME)
  const photoFolders = folders.filter((f) => PHOTO_FOLDER.test(f.name.trim()))
  const trackFolders = folders.filter((f) => !photoFolders.includes(f))
  const [nested, photoFiles] = await Promise.all([
    Promise.all(
      trackFolders.map(async (folder) =>
        (await listChildren(folder.id, apiKey)).filter(isCsv).map((f) => toSource(f, folder.name)),
      ),
    ),
    Promise.all(photoFolders.map(async (folder) => (await listChildren(folder.id, apiKey)).filter(isImage))),
  ])
  const photos: Record<string, string> = {}
  for (const f of photoFiles.flat()) photos[f.name.replace(/\.[^.]+$/, '').trim()] = drivePhotoUrl(f.id)
  const sheet = root.find((f) => f.mimeType === SHEET_MIME && /einstellungen/i.test(f.name))
  return {
    files: [...root.filter(isCsv).map((f) => toSource(f, UNKNOWN_TRACK)), ...nested.flat()],
    settingsSheetId: sheet?.id ?? null,
    photos,
  }
}

/** Liest die Tabs Fahrer, Fahrzeuge und Korrekturen (ohne Kopfzeile) über die Sheets API. */
export async function readSettingsSheet(sheetId: string, apiKey: string) {
  const tabs = ['Fahrer', 'Fahrzeuge', 'Korrekturen'] as const
  const params = new URLSearchParams({ key: apiKey })
  for (const t of tabs) params.append('ranges', `${t}!A2:F`)
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchGet?${params}`)
  if (!res.ok) throw new Error(`Einstellungen konnten nicht gelesen werden (${res.status})`)
  const body = (await res.json()) as { valueRanges: { values?: string[][] }[] }
  const [fahrer, fahrzeuge, korrekturen] = body.valueRanges.map((r) => r.values ?? [])
  return { fahrer, fahrzeuge, korrekturen }
}

const CACHE_PREFIX = 'gr-legends:file:'

/** Lädt eine Datei; Inhalt wird pro `modifiedTime` im localStorage zwischengespeichert. */
export async function downloadDriveFile(file: SourceFile, apiKey: string): Promise<string> {
  const cacheKey = `${CACHE_PREFIX}${file.id}:${file.modifiedTime}`
  try {
    const cached = localStorage.getItem(cacheKey)
    if (cached != null) return cached
  } catch {
    // localStorage nicht verfügbar – ohne Cache weiter
  }

  const res = await fetch(`${API}/${file.id}?alt=media&key=${encodeURIComponent(apiKey)}`)
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
