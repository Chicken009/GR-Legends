import { AXIS, GRID, linePath, niceTicks, scale, Tip, type TipContent, useTipState, useWidth } from './common'

export interface LinePoint {
  y: number
  /** Antippbarer Punkt mit Erklärung (z. B. Elo-Wendepunkt) */
  tip?: TipContent
  /** Hervorgehobener Punkt */
  mark?: boolean
  /** Vorläufig (z. B. Einstufung): Linie bis hierher grau gestrichelt, ohne Fläche */
  muted?: boolean
}

const MUTED = 'var(--muted)'

/** Graue Hintergrundlinie mit eigener, unbeschrifteter Skala (z. B. Rang hinter der Elo) */
export interface BackLine {
  values: (number | null)[]
  invert?: boolean
  format: (v: number) => string
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
  back,
  minSpan = 0,
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
  back?: BackLine
  /** Mindestspanne der Achse (z. B. bei fast gleichbleibender Elo keine doppelten Beschriftungen) */
  minSpan?: number
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [open, setOpen] = useTipState<number>(ref, initialTip)
  if (points.length === 0) return null
  const ys = points.map((p) => p.y)
  let min = Math.min(...ys)
  let max = Math.max(...ys)
  if (max - min < minSpan) {
    const mid = (min + max) / 2
    min = mid - minSpan / 2
    max = mid + minSpan / 2
  }
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
  // Vorläufige Punkte am Anfang: grau gestrichelt bis zum ersten festen Punkt
  const firstSolid = points.findIndex((p) => !p.muted)
  const solidFrom = firstSolid < 0 ? pts.length : firstSolid
  const mutedPts = pts.slice(0, Math.min(pts.length, solidFrom + 1))
  const solidPts = pts.slice(solidFrom)
  const lastMuted = solidPts.length === 0
  // Hintergrundlinie: eigene Skala im mittleren Bereich, damit sie die Hauptlinie nicht dominiert
  const backVals = back?.values.filter((v): v is number => v != null) ?? []
  const backPts = (() => {
    if (!back || backVals.length < 2) return null
    const lo = Math.min(...backVals) - 0.5
    const hi = Math.max(...backVals) + 0.5
    const by = back.invert ? scale(lo, hi, top + 6, bottom - 6) : scale(lo, hi, bottom - 6, top + 6)
    return back.values.map((v, i) => (v == null ? null : ([sx(i), by(v)] as [number, number])))
  })()
  const backLast = backPts ? [...backPts.keys()].filter((i) => backPts[i]).pop() : undefined
  return (
    <div ref={ref} className="chart" style={{ height }}>
      <svg width={width} height={height} role="img" aria-label={label} className="icon-shadow">
        {ticks.map((t) => (
          <g key={t}>
            <path d={`M0 ${sy(t)}H${width}`} stroke="var(--track)" />
            <text x="0" y={sy(t) - 4} fill={AXIS} fontSize="10">
              {format(t)}
            </text>
          </g>
        ))}
        {backPts && (
          <g>
            <path d={linePath(backPts.filter((p): p is [number, number] => p != null))} fill="none" stroke="var(--faint-2)" strokeWidth="1.6" strokeDasharray="4 3" strokeLinejoin="round" />
            {backLast != null && (
              <text
                x={backPts[backLast]![0] - 40}
                y={Math.max(top, Math.min(bottom - 4, backPts[backLast]![1] - 5))}
                fill="var(--muted)"
                fontSize="10"
                fontWeight="700"
                textAnchor="end"
              >
                {back!.format(back!.values[backLast]!)}
              </text>
            )}
          </g>
        )}
        {area && !invert && solidPts.length > 1 && <path d={`${linePath(solidPts)} L${last[0]} ${bottom} L${solidPts[0][0]} ${bottom} Z`} fill={color} opacity="0.12" />}
        {solidFrom > 0 && mutedPts.length > 1 && <path d={linePath(mutedPts)} fill="none" stroke={MUTED} strokeWidth="2" strokeDasharray="5 4" strokeLinejoin="round" strokeLinecap="round" />}
        {solidPts.length > 1 && <path d={linePath(solidPts)} fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />}
        {points.map((p, i) =>
          p.tip ? <circle key={i} cx={pts[i][0]} cy={pts[i][1]} r={open === i ? 6 : 4.5} fill="var(--card)" stroke="var(--text)" strokeWidth="2" /> : null,
        )}
        <circle cx={last[0]} cy={last[1]} r="5" fill={lastMuted ? MUTED : color} stroke="var(--card)" strokeWidth="2" />
        <text x={Math.min(last[0], width - 4)} y={last[1] + (invert ? 18 : -8)} fill={lastMuted ? MUTED : 'var(--text)'} textAnchor="end" fontWeight="700" fontSize="12">
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
