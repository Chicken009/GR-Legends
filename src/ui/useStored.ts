import { useState } from 'react'

const PREFIX = 'gr-legends:ui:'

/** useState, der sich die Auswahl auf diesem Gerät merkt (Ansicht, Filter). */
export function useStored<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(PREFIX + key)
      return raw != null ? (JSON.parse(raw) as T) : initial
    } catch {
      return initial
    }
  })
  const set = (v: T) => {
    setValue(v)
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(v))
    } catch {
      // Speicher gesperrt – nur für diese Sitzung
    }
  }
  return [value, set] as const
}
