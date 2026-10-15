export type SessionType = 'Rennen' | 'Qualifikation' | (string & {})

export type Gap =
  | { kind: 'leader' }
  | { kind: 'time'; ms: number }
  | { kind: 'laps'; laps: number }
  | { kind: 'none' }

/**
 * normal: saubere Runde · invalid: zu kurz (z. B. Auto per Hand eingesetzt)
 * pit: Boxenstopp (ggf. mit nicht gezählter Runde bei leerem Tank) · crash: Abflug
 */
export type LapStatus = 'normal' | 'invalid' | 'pit' | 'crash'

export interface Lap {
  number: number
  ms: number
  status: LapStatus
  /** Zeitverlust gegenüber der sauberen Referenzrunde (nur bei pit/crash) */
  lossMs?: number
}

export interface Result {
  position: number
  gap: Gap
  driver: string
  car: string
  laps: number
  /** Schnellste Runde laut Smartrace-Export */
  bestLapMs: number | null
  /** Schnellste plausible Runde (ohne Fehlauslösungen) */
  validBestLapMs: number | null
  pitStops: number
  lapTimes: Lap[]
}

/** Eine Smartrace-CSV-Datei = ein Lauf */
export interface Session {
  fileId: string
  fileName: string
  track: string
  /** Streckenlänge aus dem Ordnernamen, z. B. `Musterring 2364cm` */
  trackLengthCm: number | null
  /** ISO-Datum YYYY-MM-DD */
  date: string
  type: SessionType
  createdTime: string
  modifiedTime: string
  /** Laufnummer innerhalb von Renntag + Typ, ab 1 */
  heat: number
  /** Rennen mit Tankfunktion (mindestens ein Boxenstopp im Lauf) */
  tank?: boolean
  results: Result[]
}

/** Alle Läufe eines Tages auf einer Strecke */
export interface RaceDay {
  key: string
  track: string
  trackLengthCm: number | null
  date: string
  sessions: Session[]
}

/** Datei-Metadaten, wie sie aus Drive (oder den Testdaten) kommen */
export interface SourceFile {
  id: string
  name: string
  /** Name des Strecken-Unterordners, z. B. `Musterring 2364cm` */
  track: string
  createdTime: string
  modifiedTime: string
}
