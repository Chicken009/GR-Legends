import { useState } from 'react'
import { AXIS, GRID, linePath, niceTicks, scale, Tip, useWidth, type TipContent } from './common'

export interface TrendSeries {
  name: string
  color: string
  values: (number | null)[]
  dashed?: boolean
  /** Stufenlinie (z. B. Bestzeit, die nur sinken kann) */
  step?: boolean
}

/**
 * Mehrere Zeitreihen in Millisekunden auf einer Achse. Schneller ist oben, damit Verbesserung
 * als Anstieg erscheint. Jeder Punkt ist antippbar und zeigt alle Werte dieses Rennens.
 */
export function TimeTrendChart({
  series,
  band,
  tips,
  xLabels,
  label,
  height = 160,
}: {
  series: TrendSeries[]
  /** Spanne im Hintergrund (z. B. eigene Rundenzeiten von schnell bis langsam) */
  band?: { lo: (number | null)[]; hi: (number | null)[]; color: string }
  tips: TipContent[]
  xLabels: { index: number; text: string }[]
  label: string
  height?: number
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [open, setOpen] = useState<number | null>(null)
  const n = Math.max(0, ...series.map((s) => s.values.length))
  const vals = [...series.flatMap((s) => s.values), ...(band ? [...band.lo, ...band.hi] : [])].filter((v): v is number => v != null)
  if (n < 2 || vals.length === 0) return <p className="muted" style={{ margin: 0, fontSize: 13 }}>Noch zu wenige Rennen.</p>
  const lo = Math.min(...vals)
  const hi = Math.max(...vals)
  const pad = (hi - lo) * 0.12 || 200
  const top = 12
  const bottom = height - 20
  const sx = scale(0, n - 1, 34, width - 10)
  // schneller (kleiner) oben
  const sy = scale(lo - pad, hi + pad, top, bottom)
  const ticks = niceTicks((lo - pad) / 1000, (hi + pad) / 1000, 3)
  const path = (s: TrendSeries) => {
    const segs: [number, number][][] = []
    let cur: [number, number][] = []
    s.values.forEach((v, i) => {
      if (v == null) {
        if (cur.length) segs.push(cur)
        cur = []
        return
      }
      const x = sx(i)
      const y = sy(v)
      if (s.step && cur.length) cur.push([x, cur[cur.length - 1][1]])
      cur.push([x, y])
    })
    if (cur.length) segs.push(cur)
    return segs.map((seg) => linePath(seg)).join(' ')
  }
  const hitW = Math.max(12, Math.min(32, width / n))
  // Fläche der Spanne: oben die schnellen, unten die langsamen Runden
  const bandPath = (() => {
    if (!band) return ''
    const idx = band.lo.map((v, i) => (v != null && band.hi[i] != null ? i : -1)).filter((i) => i >= 0)
    if (idx.length < 2) return ''
    const upper = idx.map((i) => [sx(i), sy(band.lo[i]!)] as [number, number])
    const lower = idx.map((i) => [sx(i), sy(band.hi[i]!)] as [number, number]).reverse()
    return `${linePath(upper)} ${lower.map(([x, y]) => `L${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')} Z`
  })()
  const gid = `band-${label.length}`
  return (
    <div ref={ref} className="chart" style={{ height }}>
      <svg width={width} height={height} role="img" aria-label={label}>
        {band && (
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={band.color} stopOpacity="0.32" />
              <stop offset="1" stopColor={band.color} stopOpacity="0.04" />
            </linearGradient>
          </defs>
        )}
        {bandPath && <path d={bandPath} fill={`url(#${gid})`} />}
        {ticks.map((t) => (
          <g key={t}>
            <path d={`M30 ${sy(t * 1000)}H${width}`} stroke={GRID} />
            <text x="0" y={sy(t * 1000) + 3} fill={AXIS} fontSize="10">
              {t.toLocaleString('de-DE', { maximumFractionDigits: 1 })}
            </text>
          </g>
        ))}
        {series.map((s) => (
          <path key={s.name} d={path(s)} fill="none" stroke={s.color} strokeWidth={s.dashed ? 2 : 2.6} strokeDasharray={s.dashed ? '5 4' : undefined} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {open != null && <path d={`M${sx(open)} ${top}V${bottom}`} stroke="#3A404A" strokeDasharray="3 3" />}
        {series.map((s) => {
          const lastIdx = s.values.map((v, i) => (v != null ? i : -1)).filter((i) => i >= 0).pop()
          return (
            <g key={s.name}>
              {open != null && s.values[open] != null && <circle cx={sx(open)} cy={sy(s.values[open]!)} r="4.5" fill={s.color} stroke="#1A1E24" strokeWidth="2" />}
              {lastIdx != null && open == null && <circle cx={sx(lastIdx)} cy={sy(s.values[lastIdx]!)} r="4.5" fill={s.color} stroke="#1A1E24" strokeWidth="2" />}
            </g>
          )
        })}
        {xLabels.map((l) => (
          <text key={l.index} x={sx(l.index)} y={height - 3} fill={AXIS} fontSize="10" textAnchor={l.index === 0 ? 'start' : l.index >= n - 1 ? 'end' : 'middle'}>
            {l.text}
          </text>
        ))}
      </svg>
      {Array.from({ length: n }, (_, i) => (
        <button
          key={i}
          className="hit"
          style={{ left: sx(i), top: (top + bottom) / 2, width: hitW, height: bottom - top, marginLeft: -hitW / 2, marginTop: -(bottom - top) / 2, borderRadius: 6 }}
          aria-label={typeof tips[i]?.text === 'string' ? (tips[i].text as string) : `Rennen ${i + 1}`}
          onClick={() => setOpen(open === i ? null : i)}
          onMouseEnter={() => setOpen(i)}
          onMouseLeave={() => setOpen(null)}
        />
      ))}
      {open != null && tips[open] && <Tip x={sx(open)} y={top + 20} width={width} above={false} tip={tips[open]} />}
    </div>
  )
}
