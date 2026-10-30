/** Feste Farben für Fahrer in Diagrammen (Grün ist für „Ich“ reserviert). */
// Reihenfolge auf Farbsehschwäche geprüft: benachbarte Farben bleiben unterscheidbar
export const SERIES = ['#3987E5', '#D95926', '#2BA8A0', '#C98500', '#8E7CF0', '#D55181', '#7F9A3A', '#B5534A']
// Bereichs- und Ich-Farbe als CSS-Variablen: im hellen Modus dunkler, damit Schrift lesbar bleibt
export const ME = 'var(--me)'

export const AREA = {
  drivers: 'var(--drivers)',
  cars: 'var(--cars)',
  stats: 'var(--stats)',
  history: 'var(--history)',
  home: 'var(--text)',
  season: 'var(--season)',
  events: 'var(--events)',
} as const

export type Area = keyof typeof AREA

/** Gleicher Fahrer → gleiche Farbe in allen Diagrammen einer Ansicht */
export function seriesColors(names: string[], me: string | null): Map<string, string> {
  const out = new Map<string, string>()
  let i = 0
  for (const n of names) {
    if (n === me) out.set(n, ME)
    else out.set(n, SERIES[i++ % SERIES.length])
  }
  return out
}

/** Abstufung einer Farbe für Teile eines Ganzen: 0 = die Farbe selbst, höhere Stufen heller bzw. dunkler im Wechsel */
export function shade(hex: string, step: number): string {
  if (!step) return hex
  const n = parseInt(hex.slice(1), 16)
  const mix = (c: number, t: number, f: number) => Math.round(c + (t - c) * f)
  const f = Math.min(0.7, 0.38 * Math.ceil(step / 2))
  const target = step % 2 ? 255 : 0
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => mix(c, target, f))
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`
}
