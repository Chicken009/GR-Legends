import { useQuery } from '@tanstack/react-query'
import { config, driveEnabled } from '../config'
import { classifyAllLaps } from '../domain/laps'
import { buildModel, type Model } from '../domain/model'
import { buildSession, dropDuplicates, groupRaceDays } from '../domain/sessions'
import type { RaceDay, Session } from '../types'
import { downloadDriveFile, listDriveFiles, readSettingsSheet } from './drive'
import { renameEventDrivers, resolveEvents, type EventFolder, type RawEvent } from './events'
import { eventSlug } from '../domain/event/normalize'
import { applySettings, EMPTY_SETTINGS, nameKey, parseSettings, unmatchedSettings, type Settings } from './settings'

export interface AppData {
  model: Model
  days: RaceDay[]
  settings: Settings
  photos: Record<string, string>
  /** Einträge im Einstellungen-Sheet ohne passenden Namen in den Rennen */
  unmatched: { drivers: number[]; cars: string[] }
  /** Warum die Einstellungen nicht gelesen werden konnten (null = alles gut oder kein Sheet) */
  settingsProblem: string | null
  source: 'drive' | 'local' | 'fixtures'
  /** Läufe, die nicht geladen werden konnten (werden automatisch nachgeladen) */
  missing: number
  /** Wettkämpfe (Unterordner der Streckenordner) */
  events: EventFolder[]
  /** Alle Läufe nach Einstellungen und Rundenklassifizierung – auch Wettkampfläufe, die nicht in die Wertung zählen */
  allSessions: Session[]
}

type Raw = Omit<AppData, 'model' | 'days' | 'unmatched' | 'events' | 'allSessions'> & { sessions: Session[]; rawEvents: RawEvent[] }

async function loadRaw(): Promise<Raw> {
  if (driveEnabled) {
    const apiKey = config.googleApiKey!
    const listing = await listDriveFiles(config.driveFolderId!, apiKey)
    let settingsProblem: string | null = listing.settingsNotSheet
      ? 'Die Einstellungen liegen als Datei (z. B. Excel) im Ordner und nicht als Google-Tabelle. In Drive „Öffnen mit → Google Tabellen“ wählen und danach die Datei löschen.'
      : null
    const settingsPromise = listing.settingsSheetId
      ? readSettingsSheet(listing.settingsSheetId, apiKey)
          .then(parseSettings)
          .catch((err) => {
            console.warn('Einstellungen übersprungen', err)
            settingsProblem = 'Das Einstellungen-Sheet konnte nicht gelesen werden. Bitte Freigabe („Jeder mit dem Link“) und die Tabs „Fahrer“, „Fahrzeuge“, „Korrekturen“ prüfen.'
            return EMPTY_SETTINGS
          })
      : Promise.resolve(EMPTY_SETTINGS)
    const sessions = await Promise.all(
      listing.files.map(async (file) => {
        try {
          return buildSession(file, await downloadDriveFile(file, apiKey))
        } catch (err) {
          // undefined = nicht geladen (anders als null = keine gültige Smartrace-Datei)
          console.warn(`Datei nicht geladen: ${file.name}`, err)
          return undefined
        }
      }),
    )
    const rawEvents = await Promise.all(
      listing.events.map(async (e) => {
        let json: string | null = null
        if (e.json) {
          try {
            json = await downloadDriveFile(e.json, apiKey)
          } catch (err) {
            console.warn(`Wettkampf übersprungen: ${e.name}`, err)
          }
        }
        return { name: e.name, track: e.track, json }
      }),
    )
    const settings = await settingsPromise
    return {
      missing: sessions.filter((s) => s === undefined).length,
      sessions: sessions.filter((s): s is Session => s != null),
      settings,
      settingsProblem,
      photos: listing.photos,
      source: 'drive',
      rawEvents,
    }
  }

  if (import.meta.env.DEV) {
    const { loadFixtures } = await import('./fixtures')
    const { files, events } = loadFixtures()
    return {
      sessions: files.map(({ file, text }) => buildSession(file, text)).filter((s): s is Session => s != null),
      settings: EMPTY_SETTINGS,
      settingsProblem: null,
      missing: 0,
      photos: {},
      source: files.some(({ file }) => file.id.startsWith('local-') && !file.event) ? 'local' : 'fixtures',
      rawEvents: events,
    }
  }

  throw new Error('VITE_GOOGLE_API_KEY und VITE_DRIVE_FOLDER_ID sind nicht gesetzt.')
}

/**
 * Alle Läufe → Einstellungen → Rundenklassifizierung → Wertung und Kennzahlen. Läufe von
 * Wettkämpfen mit „zählt nicht für Elo und Saison“ bleiben aus der Wertung heraus.
 */
export function prepare(sessions: Session[], settings: Settings, events: EventFolder[] = []) {
  const classified = classifyAllLaps(applySettings(dropDuplicates(sessions), settings))
  const excluded = new Set(events.filter((e) => !e.def.countInStats).map((e) => e.id))
  const counted = classified.filter((s) => !s.event || !excluded.has(eventSlug(s.event)))
  // Erst gruppieren: dabei bekommen die Läufe ihre Nummer (Rennen 1, 2, …)
  const days = groupRaceDays(counted)
  const numbered = new Map(days.flatMap((d) => d.sessions).map((s) => [s.fileId, s]))
  return { model: buildModel([...numbered.values()]), days, allSessions: classified.map((s) => numbered.get(s.fileId) ?? s) }
}

/** Läufe eines Wettkampfs (alle Ordner mit diesem Namen) */
export const eventSessions = (all: Session[], eventId: string) => all.filter((s) => s.event && eventSlug(s.event) === eventId)

export function useAppData() {
  return useQuery({
    queryKey: ['appData'],
    queryFn: async (): Promise<AppData> => {
      const { sessions, rawEvents, ...rest } = await loadRaw()
      const firstDate = (folder: string) => sessions.filter((s) => s.event === folder).map((s) => s.date).sort()[0] ?? null
      // Namen im Wettkampf wie in den Läufen: Anzeigename aus dem Sheet, sonst wie geschrieben
      const rename = (n: string) => rest.settings.aliases[nameKey(n)] ?? n
      const events = resolveEvents(rawEvents, firstDate).map((e) => ({ ...e, def: renameEventDrivers(e.def, rename) }))
      return { ...rest, events, unmatched: unmatchedSettings(sessions, rest.settings), ...prepare(sessions, rest.settings, events) }
    },
    staleTime: 5 * 60_000,
    // Fehlende Läufe nachladen – was schon da ist, kommt aus dem Zwischenspeicher. Google sperrt
    // Downloads bei zu vielen Anfragen aus einem Netz eine Weile; häufiges Nachfragen verlängert
    // das. Deshalb wachsende Abstände: 15 s, 30 s, 1 min … höchstens 5 min.
    refetchInterval: (q) => (q.state.data?.missing ? Math.min(15_000 * 2 ** Math.max(0, q.state.dataUpdateCount - 1), 5 * 60_000) : false),
  })
}
