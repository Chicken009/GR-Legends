const TIME_RE = /^(\d+):(\d{1,2})\.(\d{1,3})$/

/** Parst Smartrace-Zeiten im Format `m:ss.mmm` in Millisekunden. */
export function parseTime(value: string): number | null {
  const m = TIME_RE.exec(value.trim())
  if (!m) return null
  const [, min, sec, frac] = m
  return Number(min) * 60_000 + Number(sec) * 1000 + Number(frac.padEnd(3, '0'))
}

/** Formatiert Millisekunden als `ss.mmm` bzw. `m:ss.mmm`. */
export function formatTime(ms: number | null | undefined): string {
  if (ms == null) return '–'
  const min = Math.floor(ms / 60_000)
  const sec = Math.floor((ms % 60_000) / 1000)
  const milli = String(ms % 1000).padStart(3, '0')
  return min > 0 ? `${min}:${String(sec).padStart(2, '0')}.${milli}` : `${sec}.${milli}`
}
