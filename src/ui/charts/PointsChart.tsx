import { formatDate, shortName } from '../format'
import { AXIS, GRID, linePath, niceTicks, Tip, useTipState, useWidth } from './common'

/**
 * Punkteverlauf der Saison: Punkte nach jedem Renntag, Punkte direkt verbunden, Namen rechts.
 * `values[i]` = Punktestand nach Renntag i (null = noch nicht dabei).
 * Statt Daten gehen auch eigene Achsen- und Tooltip-Texte (`axis`, `tips`), z. B. Läufe eines Wettkampfs.
 */
export function PointsChart({ dates, series, label, axis, tips }: { dates: string[]; series: { name: string; color: string; values: (number | null)[] }[]; label: string; axis?: string[]; tips?: string[] }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [open, setOpen] = useTipState<{ s: number; i: number }>(ref)
  if (dates.length < 2 || !series.length) return null
  const h = 210
  const left = 28
  const right = 78
  const top = 10
  const bottom = 24
  const max = Math.max(1, ...series.flatMap((s) => s.values.filter((v): v is number => v != null)))
  const ticks = niceTicks(0, max, 4)
  const top2 = Math.max(max, ticks[ticks.length - 1] ?? max)
  const sx = (i: number) => left + (i / (dates.length - 1)) * (width - left - right)
  const sy = (v: number) => top + (1 - v / top2) * (h - top - bottom)
  // Namen am Ende nicht überlappen lassen
  const labels = series
    .map((s, si) => {
      const lastIdx = s.values.map((v, i) => (v != null ? i : -1)).filter((i) => i >= 0).pop()
      return lastIdx == null ? null : { si, y: sy(s.values[lastIdx]!) }
    })
    .filter((x): x is { si: number; y: number } => x != null)
    .sort((a, b) => a.y - b.y)
  for (let k = 1; k < labels.length; k++) if (labels[k].y - labels[k - 1].y < 13) labels[k].y = labels[k - 1].y + 13
  const step = Math.ceil(dates.length / 5)
  return (
    <div ref={ref} className="chart" style={{ height: h }}>
      <svg width={width} height={h} role="img" aria-label={label}>
        {ticks.map((t) => (
          <g key={t}>
            <path d={`M${left} ${sy(t)}H${width - right}`} stroke={GRID} />
            <text x={left - 6} y={sy(t) + 3} textAnchor="end" fill={AXIS} fontSize="10">
              {t}
            </text>
          </g>
        ))}
        {dates.map((d, i) =>
          i % step === 0 || i === dates.length - 1 ? (
            <text key={d} x={sx(i)} y={h - 6} textAnchor={i === 0 ? 'start' : i === dates.length - 1 ? 'end' : 'middle'} fill={AXIS} fontSize="10">
              {axis ? axis[i] : formatDate(d).slice(0, 5)}
            </text>
          ) : null,
        )}
        {series.map((s) => {
          const pts = s.values.map((v, i) => (v != null ? ([sx(i), sy(v)] as [number, number]) : null)).filter((p): p is [number, number] => p != null)
          return <path key={s.name} d={linePath(pts)} fill="none" stroke={s.color} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
        })}
        {series.map((s, si) =>
          s.values.map((v, i) =>
            v == null ? null : (
              <circle key={`${si}-${i}`} cx={sx(i)} cy={sy(v)} r={open?.s === si && open.i === i ? 6 : 4} fill={s.color} stroke="#1A1E24" strokeWidth="2" />
            ),
          ),
        )}
        {labels.map(({ si, y }) => (
          <g key={series[si].name}>
            <rect x={width - right + 6} y={y - 3} width="6" height="6" rx="1.5" fill={series[si].color} />
            <text x={width - right + 16} y={y + 4} fill="#C5CCD3" fontSize="11" fontWeight="600">
              {shortName(series[si].name)}
            </text>
          </g>
        ))}
      </svg>
      {series.map((s, si) =>
        s.values.map((v, i) =>
          v == null ? null : (
            <button
              key={`${si}-${i}`}
              className="hit"
              aria-label={`${s.name}, ${tips ? tips[i] : formatDate(dates[i])}: ${v} Punkte`}
              style={{ left: sx(i) - 13, top: sy(v) - 13, width: 26, height: 26, borderRadius: 13 }}
              onClick={() => setOpen(open?.s === si && open.i === i ? null : { s: si, i })}
              onPointerEnter={(e) => e.pointerType === 'mouse' && setOpen({ s: si, i })}
              onPointerLeave={(e) => e.pointerType === 'mouse' && setOpen(null)}
            />
          ),
        ),
      )}
      {open && series[open.s]?.values[open.i] != null && (
        <Tip x={sx(open.i)} y={sy(series[open.s].values[open.i]!)} width={width} tip={{ title: series[open.s].name, text: `${series[open.s].values[open.i]} Punkte ${tips ? tips[open.i] : `nach dem ${formatDate(dates[open.i])}`}`, color: series[open.s].color }} />
      )}
    </div>
  )
}
