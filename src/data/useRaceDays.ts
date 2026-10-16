import { useQuery } from '@tanstack/react-query'
import { config, driveEnabled } from '../config'
import { classifyAllLaps } from '../domain/laps'
import { buildModel, type Model } from '../domain/model'
import { buildSession, groupRaceDays } from '../domain/sessions'
import type { RaceDay, Session } from '../types'
import { downloadDriveFile, listDriveFiles, readSettingsSheet } from './drive'
import { applySettings, EMPTY_SETTINGS, parseSettings, unmatchedSettings, type Settings } from './settings'

export interface AppData {
  model: Model
  days: RaceDay[]
  settings: Settings
  photos: Record<string, string>
  /** Einträge im Einstellungen-Sheet ohne passenden Namen in den Rennen */
  unmatched: { drivers: string[]; cars: string[] }
  source: 'drive' | 'local' | 'fixtures'
}

async function loadRaw(): Promise<Omit<AppData, 'model' | 'days' | 'unmatched'> & { sessions: Session[] }> {
  if (driveEnabled) {
    const apiKey = config.googleApiKey!
    const listing = await listDriveFiles(config.driveFolderId!, apiKey)
    const settingsPromise = listing.settingsSheetId
      ? readSettingsSheet(listing.settingsSheetId, apiKey)
          .then(parseSettings)
          .catch((err) => {
            console.warn('Einstellungen übersprungen', err)
            return EMPTY_SETTINGS
          })
      : Promise.resolve(EMPTY_SETTINGS)
    const sessions = await Promise.all(
      listing.files.map(async (file) => {
        try {
          return buildSession(file, await downloadDriveFile(file, apiKey))
        } catch (err) {
          console.warn(`Datei übersprungen: ${file.name}`, err)
          return null
        }
      }),
    )
    return {
      sessions: sessions.filter((s): s is Session => s != null),
      settings: await settingsPromise,
      photos: listing.photos,
      source: 'drive',
    }
  }

  if (import.meta.env.DEV) {
    const { loadFixtures } = await import('./fixtures')
    const files = loadFixtures()
    return {
      sessions: files.map(({ file, text }) => buildSession(file, text)).filter((s): s is Session => s != null),
      settings: EMPTY_SETTINGS,
      photos: {},
      source: files[0]?.file.id.startsWith('local-') ? 'local' : 'fixtures',
    }
  }

  throw new Error('VITE_GOOGLE_API_KEY und VITE_DRIVE_FOLDER_ID sind nicht gesetzt.')
}

/** Alle Läufe → Einstellungen → Rundenklassifizierung → Wertung und Kennzahlen. */
export function prepare(sessions: Session[], settings: Settings) {
  const classified = classifyAllLaps(applySettings(sessions, settings))
  // Erst gruppieren: dabei bekommen die Läufe ihre Nummer (Rennen 1, 2, …)
  const days = groupRaceDays(classified)
  return { model: buildModel(days.flatMap((d) => d.sessions)), days }
}

export function useAppData() {
  return useQuery({
    queryKey: ['appData'],
    queryFn: async (): Promise<AppData> => {
      const { sessions, ...rest } = await loadRaw()
      return { ...rest, unmatched: unmatchedSettings(sessions, rest.settings), ...prepare(sessions, rest.settings) }
    },
    staleTime: 5 * 60_000,
  })
}
