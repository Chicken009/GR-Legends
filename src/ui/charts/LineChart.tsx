import { AXIS, GRID, linePath, niceTicks, scale, Tip, type TipContent, useTipState, useWidth } from './common'

export interface LinePoint {
  y: number
  /** Antippbarer Punkt mit Erklärung (z. B. Elo-Wendepunkt) */
  tip?: TipContent
  /** Hervorgehobener Punkt */
  mark?: boolean
}

/**
 * Einfaches Liniendiagramm mit einer Achse, Fläche darunter und antippbaren Wendepunkten.
 * `invert` dreht die Achse (Rang 1 oben).
 */
export function LineChart({
  points,
  color,
  height = 150,
  format = (v) => String(Math.round(v)),
  xLabels = [],
  invert = false,
  label,
  area = true,
  initialTip = null,
}: {
  points: LinePoint[]
  color: string
  height?: number
  format?: (v: number) => string
  xLabels?: { index: number; text: string }[]
  invert?: boolean
  label: string
  area?: boolean
  initialTip?: number | null
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [open, setOpen] = useTipState<number>(ref, initialTip)
  if (points.length === 0) return null
  const ys = points.map((p) => p.y)
  let min = Math.min(...ys)
  let max = Math.max(...ys)
  const pad = (max - min) * 0.12 || 1
  min -= pad
  max += pad
  const top = 20
  const bottom = height - 20
  const sx = scale(0, Math.max(1, points.length - 1), 8, width - 8)
  const sy = invert ? scale(min, max, top, bottom) : scale(min, max, bottom, top)
  const pts = points.map((p, i) => [sx(i), sy(p.y)] as [number, number])
  const ticks = niceTicks(min, max, 3)
  const last = pts[pts.length - 1]
  return (
    <div ref={ref} className="chart" style={{ height }}>
      <svg width={width} height={height} role="img" aria-label={label} className="icon-shadow">
        {ticks.map((t) => (
          <g key={t}>
            <path d={`M0 ${sy(t)}H${width}`} stroke="#262B33" />
            <text x="0" y={sy(t) - 4} fill={AXIS} fontSize="10">
              {format(t)}
            </text>
          </g>
        ))}
        {area && !invert && <path d={`${linePath(pts)} L${last[0]} ${bottom} L${pts[0][0]} ${bottom} Z`} fill={color} opacity="0.12" />}
        <path d={linePath(pts)} fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) =>
          p.tip ? <circle key={i} cx={pts[i][0]} cy={pts[i][1]} r={open === i ? 6 : 4.5} fill="#1A1E24" stroke="#F2F4F5" strokeWidth="2" /> : null,
        )}
        <circle cx={last[0]} cy={last[1]} r="5" fill={color} stroke="#1A1E24" strokeWidth="2" />
        <text x={Math.min(last[0], width - 4)} y={last[1] + (invert ? 18 : -8)} fill="#F2F4F5" textAnchor="end" fontWeight="700" fontSize="12">
          {format(points[points.length - 1].y)}
        </text>
        {xLabels.map((l) => (
          <text key={l.index} x={sx(l.index)} y={height - 2} fill={AXIS} fontSize="10" textAnchor={l.index === 0 ? 'start' : l.index >= points.length - 1 ? 'end' : 'middle'}>
            {l.text}
          </text>
        ))}
        <path d={`M0 ${bottom}H${width}`} stroke={GRID} />
      </svg>
      {points.map((p, i) =>
        p.tip ? (
          <button
            key={i}
            className="hit"
            style={{ left: pts[i][0], top: pts[i][1] }}
            aria-label={`${typeof p.tip.title === 'string' ? p.tip.title : ''} ${typeof p.tip.text === 'string' ? p.tip.text : ''}`}
            aria-expanded={open === i}
            onClick={() => setOpen(open === i ? null : i)}
            onPointerEnter={(e) => e.pointerType === 'mouse' && setOpen(i)}
          />
        ) : null,
      )}
      {open != null && points[open]?.tip && <Tip x={pts[open][0]} y={pts[open][1]} width={width} tip={points[open].tip!} above={pts[open][1] > height * 0.45} />}
    </div>
  )
}
