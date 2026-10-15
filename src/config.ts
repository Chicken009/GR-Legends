export const config = {
  googleApiKey: import.meta.env.VITE_GOOGLE_API_KEY as string | undefined,
  driveFolderId: import.meta.env.VITE_DRIVE_FOLDER_ID as string | undefined,
}

/** Ohne API-Key/Ordner-ID nutzt die App im Dev-Modus die Testdaten aus `test/fixtures`. */
export const driveEnabled = Boolean(config.googleApiKey && config.driveFolderId)

/** Name für Dateien, die direkt im Hauptordner (ohne Strecken-Unterordner) liegen. */
export const UNKNOWN_TRACK = 'Unbekannte Strecke'
