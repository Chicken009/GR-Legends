import { useEffect, useState } from 'react'
import type { Challenge } from '../domain/challenges'

/** Nach Erfüllung sortiert: geschafft zuerst, dann nach Fortschritt */
export const byProgress = (a: Challenge, b: Challenge) => b.value / b.target - a.value / a.target

/** Seltenheit nach Anteil der Saisonfahrer, die es geschafft haben */
export function rarity(done: number, total: number): { label: string; color: string } {
  if (done === 0) return { label: 'Legendär · noch niemand', color: '#C77DFF' }
  const share = done / Math.max(1, total)
  if (share <= 0.1) return { label: 'Legendär', color: '#C77DFF' }
  if (share <= 0.25) return { label: 'Selten', color: '#E8783A' }
  if (share <= 0.5) return { label: 'Ungewöhnlich', color: '#2BA8A0' }
  return { label: 'Häufig', color: '#8A94A0' }
}

const seenKey = (driver: string, year: string) => `gr-legends:challenges-seen:${driver}:${year}`

/** Geschaffte Challenges, die der Fahrer auf diesem Gerät noch nicht gesehen hat */
export function unseenDone(driver: string, year: string, list: Challenge[]): Set<string> {
  let seen: string[] | null = null
  try {
    const raw = localStorage.getItem(seenKey(driver, year))
    seen = raw ? (JSON.parse(raw) as string[]) : null
  } catch {
    return new Set()
  }
  // Beim allerersten Mal nichts als neu markieren
  if (seen == null) return new Set()
  return new Set(list.filter((c) => c.done && !seen!.includes(c.id)).map((c) => c.id))
}

/** Merkt sich nach dem Anzeigen, was geschafft ist; liefert, was dabei neu war */
export function useMarkChallengesSeen(driver: string | null, year: string, list: Challenge[] | null): Set<string> {
  const [fresh] = useState(() => (driver && list ? unseenDone(driver, year, list) : new Set<string>()))
  useEffect(() => {
    if (!driver || !list) return
    try {
      localStorage.setItem(seenKey(driver, year), JSON.stringify(list.filter((c) => c.done).map((c) => c.id)))
    } catch {
      // Speicher gesperrt – dann gibt es keine „Neu“-Markierung
    }
  }, [driver, year, list])
  return fresh
}
