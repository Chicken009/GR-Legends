import { parseFileName } from '../data/parseFileName'
import { parseSmartraceCsv } from '../data/parseSmartrace'
import { parseTrack } from '../data/parseTrack'
import type { RaceDay, Session, SourceFile } from '../types'

/**
 * Baut aus einer Datei + Inhalt einen Lauf. `heat` wird erst in `groupRaceDays` gesetzt,
 * die Rundenklassifizierung in `classifyAllLaps` (braucht alle Läufe).
 */
export function buildSession(file: SourceFile, text: string): Session | null {
  const info = parseFileName(file.name)
  if (!info) return null
  const track = parseTrack(file.track)
  return {
    fileId: file.id,
    fileName: file.name,
    track: track.name,
    trackLengthCm: track.lengthCm,
    date: info.date,
    type: info.type,
    createdTime: file.createdTime,
    modifiedTime: file.modifiedTime,
    heat: 1,
    results: parseSmartraceCsv(text),
  }
}

/**
 * Gruppiert Läufe nach Strecke + Datum. Innerhalb eines Renntags werden die Läufe nach
 * Upload-Zeit sortiert und pro Typ durchnummeriert. Neueste Renntage zuerst.
 */
export function groupRaceDays(sessions: Session[]): RaceDay[] {
  const days = new Map<string, RaceDay>()
  for (const s of sessions) {
    const key = `${s.date}|${s.track}`
    let day = days.get(key)
    if (!day) {
      day = { key, track: s.track, trackLengthCm: s.trackLengthCm, date: s.date, sessions: [] }
      days.set(key, day)
    }
    day.sessions.push(s)
  }

  for (const day of days.values()) {
    day.sessions.sort((a, b) => a.createdTime.localeCompare(b.createdTime))
    const counters = new Map<string, number>()
    day.sessions = day.sessions.map((s) => {
      const heat = (counters.get(s.type) ?? 0) + 1
      counters.set(s.type, heat)
      return { ...s, heat }
    })
  }

  return [...days.values()].sort(
    (a, b) => b.date.localeCompare(a.date) || a.track.localeCompare(b.track),
  )
}
