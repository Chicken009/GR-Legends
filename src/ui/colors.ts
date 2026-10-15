/** Feste Farben für Fahrer in Diagrammen (Grün ist für „Ich“ reserviert). */
export const SERIES = ['#3987E5', '#D95926', '#C98500', '#D55181', '#2BA8A0', '#8E7CF0', '#B5534A', '#7F9A3A']
export const ME = '#3BBC4A'

export const AREA = {
  drivers: '#3BBC4A',
  cars: '#AE6DEE',
  stats: '#F75F4C',
  history: '#EE9E10',
  home: '#F2F4F5',
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
