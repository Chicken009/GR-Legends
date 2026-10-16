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
    ...(file.event ? { event: file.event } : {}),
    results: parseSmartraceCsv(text),
  }
}

/**
 * Entfernt doppelte Läufe, z. B. Original und „Kopie von …“ im Drive-Ordner. Gleich ist ein Lauf,
 * wenn Strecke, Datum, Typ und alle Fahrer mit ihren Rundenzeiten übereinstimmen – die Autos
 * zählen nicht, damit eine Fassung mit nachträglich geändertem Autonamen erkannt wird. Es bleibt
 * die Fassung im Wettkampf-Ordner, sonst die zuletzt geänderte.
 */
export function dropDuplicates(sessions: Session[]): Session[] {
  const fingerprint = (s: Session) =>
    [s.track, s.date, s.type, ...s.results.map((r) => `${r.position}|${r.driver}|${r.lapTimes.map((l) => l.ms).join(',')}`)].join('\n')
  const keep = new Map<string, Session>()
  for (const s of sessions) {
    const key = fingerprint(s)
    const other = keep.get(key)
    // Die Fassung im Wettkampf-Ordner gewinnt, sonst die zuletzt geänderte
    const better = !other || (Boolean(s.event) !== Boolean(other.event) ? Boolean(s.event) : s.modifiedTime > other.modifiedTime)
    if (better) keep.set(key, s)
  }
  const kept = new Set(keep.values())
  return sessions.filter((s) => kept.has(s))
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
