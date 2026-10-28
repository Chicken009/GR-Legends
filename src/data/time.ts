// m:ss.mmm wie von Smartrace; Tabellen-Apps machen daraus mitunter h:mm:ss.mmm oder ein Dezimalkomma
const TIME_RE = /^(?:(\d+):)?(\d+):(\d{1,2})[.,](\d{1,3})$/

/** Parst Smartrace-Zeiten im Format `m:ss.mmm` in Millisekunden. */
export function parseTime(value: string): number | null {
  const m = TIME_RE.exec(value.trim())
  if (!m) return null
  const [, hours = '0', min, sec, frac] = m
  return Number(hours) * 3_600_000 + Number(min) * 60_000 + Number(sec) * 1000 + Number(frac.padEnd(3, '0'))
}

/**
 * Formatiert Millisekunden deutsch mit Komma: `10,077 s` bzw. `4:43,307` (ab einer Minute).
 * Mit Punkt läse man „10.077“ leicht als zehntausend.
 */
export function formatTime(ms: number | null | undefined): string {
  if (ms == null) return '–'
  const min = Math.floor(ms / 60_000)
  const sec = Math.floor((ms % 60_000) / 1000)
  const milli = String(ms % 1000).padStart(3, '0')
  return min > 0 ? `${min}:${String(sec).padStart(2, '0')},${milli}` : `${sec},${milli} s`
}
