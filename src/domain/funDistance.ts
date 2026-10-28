/**
 * Witzige Vergleiche für eine gefahrene Strecke („so weit wie 190 Fußballfelder“). Jeder Vergleich
 * kommt nur, wenn die Zahl dafür sinnvoll ist (nicht 0,01 Monde und nicht 3 Millionen Fußballfelder).
 */

/** Maßstab der Autos: so viel weiter wäre die Strecke in echt */
export const CAR_SCALE = 32

/** Strecken zwischen bekannten Orten in km (gerundet, Straße bzw. Luftlinie) */
const ROUTES: [number, string][] = [
  [10, 'einmal quer durch Berlin'],
  [34, 'von Dover nach Calais – durch den Ärmelkanal'],
  [42.195, 'einen ganzen Marathon'],
  [57, 'einmal durch den Gotthard-Basistunnel'],
  [120, 'von Hamburg nach Bremen'],
  [290, 'von Hamburg nach Berlin'],
  [480, 'von Berlin nach Köln'],
  [610, 'von Hamburg nach München'],
  [1050, 'von Paris nach Rom'],
  [1233, 'einmal den ganzen Rhein entlang'],
  [2800, 'von Lissabon nach Warschau'],
  [5600, 'von Frankfurt nach New York'],
  [21196, 'einmal die Chinesische Mauer entlang'],
  [40075, 'einmal um die ganze Erde'],
  [384400, 'bis zum Mond'],
]

interface Comparison {
  /** Länge der Einheit in Metern */
  m: number
  /** sinnvoller Bereich für die Anzahl */
  min: number
  max: number
  text: (n: string) => string
}

const UNITS: Comparison[] = [
  { m: 105, min: 3, max: 5000, text: (n) => `so weit wie ${n} Fußballfelder` },
  { m: 828, min: 1.5, max: 2000, text: (n) => `${n}-mal die Burj Khalifa hoch` },
  { m: 330, min: 2, max: 3000, text: (n) => `${n}-mal auf den Eiffelturm` },
  { m: 157, min: 3, max: 5000, text: (n) => `${n}-mal auf den Kölner Dom` },
  { m: 8849, min: 0.5, max: 500, text: (n) => `${n}-mal auf den Mount Everest` },
  { m: 2737, min: 1, max: 1000, text: (n) => `${n}-mal über die Golden Gate Bridge` },
  { m: 30, min: 10, max: 20000, text: (n) => `${n} Blauwale hintereinander` },
  { m: 5.5, min: 50, max: 100000, text: (n) => `${n} Giraffen übereinandergestapelt` },
  { m: 0.2, min: 1000, max: 5_000_000, text: (n) => `${n} Bratwürste aneinandergelegt` },
  { m: 0.25, min: 1000, max: 5_000_000, text: (n) => `${n} Spaghetti hintereinander` },
  { m: 12, min: 20, max: 50000, text: (n) => `${n} Schulbusse Stoßstange an Stoßstange` },
  { m: 20832, min: 0.3, max: 300, text: (n) => `${n} Runden auf der Nordschleife` },
  { m: 3337, min: 1, max: 2000, text: (n) => `${n} Runden durch Monaco` },
  { m: 42195, min: 1, max: 200, text: (n) => `${n} Marathons` },
]

/** Anzahl lesbar: unter 10 mit einer Nachkommastelle, darüber gerundet, große Zahlen grob */
function count(v: number): string {
  const nf = (d: number) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: d })
  if (v < 10) return nf(1).format(Math.round(v * 10) / 10)
  if (v < 1000) return nf(0).format(Math.round(v))
  const step = 10 ** (Math.floor(Math.log10(v)) - 1)
  return nf(0).format(Math.round(v / step) * step)
}

/** Dauer in der passenden Einheit („3 Wochen“, „2 Jahre“) */
function duration(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} Minuten`
  if (hours < 48) return `${count(hours)} Stunden`
  const days = hours / 24
  if (days < 21) return `${count(days)} Tage`
  if (days < 120) return `${count(days / 7)} Wochen`
  if (days < 730) return `${count(days / 30.4)} Monate`
  return `${count(days / 365)} Jahre`
}

/** Alle passenden Vergleiche für eine Strecke in km (ohne führendes „so weit wie“ bei Orten) */
export function distanceComparisons(km: number): string[] {
  if (!(km > 0)) return []
  const m = km * 1000
  const out = UNITS.filter((u) => m / u.m >= u.min && m / u.m <= u.max).map((u) => u.text(count(m / u.m)))
  // Im Maßstab der Autos: weiter als die längste Strecke, die noch drunter liegt
  const real = km * CAR_SCALE
  const route = ROUTES.filter(([d]) => d <= real).at(-1)
  if (route && real >= 10) out.push(`im Maßstab 1:${CAR_SCALE} wären das ${count(real)} km, weiter als ${route[1]}`)
  // Eine Weinbergschnecke schafft etwa 3 m pro Stunde, zu Fuß etwa 5 km/h
  out.push(`eine Weinbergschnecke bräuchte dafür ${duration(m / 3)}`)
  if (km >= 2) out.push(`zu Fuß ${duration(km / 5)} unterwegs`)
  return out
}

/** Ein zufälliger Vergleich; `pick` zwischen 0 und 1 wählt ihn aus */
export function funDistance(km: number, pick: number): string | null {
  const list = distanceComparisons(km)
  if (!list.length) return null
  return list[Math.min(list.length - 1, Math.floor(pick * list.length))]
}
