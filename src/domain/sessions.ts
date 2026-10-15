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

/** Download-Nummer im Dateinamen: `Rennen_07.02.2026 (2).csv` → 2, ohne Nummer → 0 */
export function downloadNumber(fileName: string): number {
  const m = /\((\d+)\)\s*\.csv$/i.exec(fileName)
  return m ? Number(m[1]) : 0
}

/**
 * Chronologische Reihenfolge: Datum, dann Upload-Zeit. Werden mehrere Dateien gleichzeitig
 * hochgeladen, ist die Upload-Reihenfolge zufällig. Die Download-Nummer („(1)“, „(2)“ …) gibt
 * dagegen die Reihenfolge der Exporte aus Smartrace wieder. Deshalb werden Läufe desselben Typs
 * an einem Tag nach dieser Nummer geordnet, die Plätze der Typen untereinander bleiben bei der
 * Upload-Zeit.
 */
export function orderSessions(sessions: Session[]): Session[] {
  const byTime = [...sessions].sort((a, b) => a.date.localeCompare(b.date) || a.createdTime.localeCompare(b.createdTime))
  const groups = new Map<string, number[]>()
  byTime.forEach((s, i) => {
    const key = `${s.date}|${s.track}|${s.type}`
    groups.set(key, [...(groups.get(key) ?? []), i])
  })
  const out = [...byTime]
  for (const slots of groups.values()) {
    const files = slots.map((i) => byTime[i])
    if (!files.some((f) => downloadNumber(f.fileName) > 0)) continue
    const sorted = [...files].sort((a, b) => downloadNumber(a.fileName) - downloadNumber(b.fileName) || a.createdTime.localeCompare(b.createdTime))
    slots.forEach((slot, j) => (out[slot] = sorted[j]))
  }
  return out
}

/**
 * Gruppiert Läufe nach Strecke + Datum. Innerhalb eines Renntags werden die Läufe nach
 * Upload-Zeit bzw. Download-Nummer sortiert (`orderSessions`) und pro Typ durchnummeriert. Neueste Renntage zuerst.
 */
export function groupRaceDays(sessions: Session[]): RaceDay[] {
  const days = new Map<string, RaceDay>()
  for (const s of orderSessions(sessions)) {
    const key = `${s.date}|${s.track}`
    let day = days.get(key)
    if (!day) {
      day = { key, track: s.track, trackLengthCm: s.trackLengthCm, date: s.date, sessions: [] }
      days.set(key, day)
    }
    day.sessions.push(s)
  }

  for (const day of days.values()) {
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
