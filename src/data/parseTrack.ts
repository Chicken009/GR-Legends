export interface TrackInfo {
  name: string
  lengthCm: number | null
}

const LENGTH_RE = /^(.*?)\s*(\d+(?:[.,]\d+)?)\s*cm\s*$/i

/** Liest Streckenname und -länge aus Ordnernamen wie `Gintoft Ring 2364cm`. */
export function parseTrack(folderName: string): TrackInfo {
  const trimmed = folderName.trim()
  const m = LENGTH_RE.exec(trimmed)
  if (!m || !m[1]) return { name: trimmed, lengthCm: null }
  return { name: m[1].trim(), lengthCm: Number(m[2].replace(',', '.')) }
}

/** Durchschnittsgeschwindigkeit einer Runde in km/h (Originalgeschwindigkeit, nicht maßstäblich). */
export function lapSpeedKmh(lengthCm: number, lapMs: number): number {
  // cm/ms = 10 m/s = 36 km/h
  return (lengthCm / lapMs) * 36
}
