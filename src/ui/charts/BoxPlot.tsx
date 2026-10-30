import { formatTime } from '../format'
import { AXIS, GRID, Tip, useTipState, useWidth } from './common'

/** Kürzt in der Mitte, damit Endungen wie „… 2“ unterscheidbar bleiben */
const shorten = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, Math.max(3, max - 5)).trimEnd()}…${s.slice(-4).trimStart()}`)

export interface BoxRow {
  key: string
  label: string
  /** Quantile 5 %, 25 %, 50 %, 75 %, 95 % in ms */
  q: [number, number, number, number, number]
  n: number
  highlight?: boolean
}

/**
 * Verteilung von Rundenzeiten je Zeile: Balken = mittlere Hälfte, weißer Strich = Median,
 * dünne Linie = schnellste bis langsamste 5 %. Links ist schneller.
 */
export function BoxPlot({ rows, color, highlightColor = '#3BBC4A', onPick, label }: { rows: BoxRow[]; color: string; highlightColor?: string; onPick?: (key: string) => void; label: string }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [open, setOpen] = useTipState<number>(ref)
  if (!rows.length) return null
  const left = Math.max(108, Math.min(170, width * 0.36))
  const maxChars = Math.floor((left - 12) / 6.2)
  const rowH = 32
  const top = 6
  const h = top + rows.length * rowH + 24
  const lo = Math.min(...rows.map((r) => r.q[0]))
  const hi = Math.max(...rows.map((r) => r.q[4]))
  const sx = (v: number) => left + ((v - lo) / (hi - lo || 1)) * (width - left - 10)
  const step = hi - lo > 8000 ? 2 : 1
  const ticks: number[] = []
  for (let t = Math.ceil(lo / 1000); t <= Math.floor(hi / 1000); t += step) ticks.push(t)
  const fill = (c: string) => `color-mix(in srgb, ${c} 40%, transparent)`
  return (
    <div ref={ref} className="chart" style={{ height: h }}>
      <svg width={width} height={h} role="img" aria-label={label}>
        {ticks.map((t) => (
          <g key={t}>
            <path d={`M${sx(t * 1000)} ${top}V${h - 20}`} stroke={GRID} />
            <text x={sx(t * 1000)} y={h - 6} textAnchor="middle" fill={AXIS} fontSize="10">
              {t} s
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          const y = top + i * rowH + rowH / 2
          const c = r.highlight ? highlightColor : color
          return (
            <g key={r.key} data-tip-target style={{ cursor: 'pointer' }} onClick={() => (onPick ? onPick(r.key) : setOpen(open === i ? null : i))} onPointerEnter={(e) => e.pointerType === 'mouse' && setOpen(i)} onPointerLeave={(e) => e.pointerType === 'mouse' && setOpen(null)}>
              <rect x={0} y={y - rowH / 2} width={width} height={rowH} fill="transparent" />
              <text x={left - 8} y={y + 4} textAnchor="end" fill={r.highlight ? highlightColor : 'var(--text-2)'} fontSize="11" fontWeight="600">
                {shorten(r.label, maxChars)}
              </text>
              <path d={`M${sx(r.q[0])} ${y}H${sx(r.q[4])}`} stroke="var(--faint)" strokeWidth="1.5" />
              <rect x={sx(r.q[1])} y={y - 9} width={Math.max(2, sx(r.q[3]) - sx(r.q[1]))} height="18" rx="5" fill={fill(c)} stroke={c} strokeWidth={open === i ? 2 : 1.2} />
              <path d={`M${sx(r.q[2])} ${y - 9}V${y + 9}`} stroke="var(--text)" strokeWidth="2" />
            </g>
          )
        })}
      </svg>
      {open != null && rows[open] && (
        <Tip
          x={sx(rows[open].q[2])}
          y={top + open * rowH + 6}
          width={width}
          tip={{ title: rows[open].label, text: `Median ${formatTime(rows[open].q[2])} · mittlere Hälfte ${formatTime(rows[open].q[1])}–${formatTime(rows[open].q[3])}`, sub: `${rows[open].n} saubere Runden${onPick ? ' · antippen öffnet das Auto' : ''}` }}
        />
      )}
    </div>
  )
}
