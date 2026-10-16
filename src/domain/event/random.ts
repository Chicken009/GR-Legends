/**
 * Zufall mit Startwert: Aus demselben Startwert entsteht auf jedem Gerät dieselbe Folge – so
 * sehen alle dieselbe Auslosung, ohne dass sie irgendwo gespeichert werden muss.
 */

/** 32-Bit-Hash eines Textes (FNV-1a) */
export function hashString(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Zahlenfolge zwischen 0 und 1 (Mulberry32) */
export function seededRandom(seed: string): () => number {
  let a = hashString(seed)
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Gemischte Kopie (Fisher-Yates) */
export function shuffle<T>(list: T[], seed: string): T[] {
  const rnd = seededRandom(seed)
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Neuer, zufälliger Startwert für den Losknopf */
export const newSeed = () => Math.random().toString(36).slice(2, 8)
