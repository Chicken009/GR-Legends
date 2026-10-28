import { fmtNum, formatDate, shortName } from '../format'
import { AXIS, GRID, linePath, niceTicks, Tip, useTipState, useWidth } from './common'

const fmtV = (v: number) => fmtNum(v, Number.isInteger(v) ? 0 : 1)

/**
 * Punkteverlauf: Stand nach jedem Renntag bzw. Lauf, Punkte direkt verbunden, Namen rechts.
 * `values[i]` = Punktestand an Stelle i (null = noch nicht dabei).
 * Statt Daten gehen auch eigene Achsen- und Tooltip-Texte (`axis`, `tips`), z. B. Etappen eines Wettkampfs.
 * Angetippt wird eine ganze Spalte: der Tooltip zeigt alle Werte an dieser Stelle, sortiert – so gibt
 * es auch bei vielen Fahrern und Läufen nur wenige, große Tippziele.
 */
export function PointsChart({ dates, series, label, axis, tips, short = shortName }: { dates: string[]; series: { name: string; color: string; values: (number | null)[] }[]; label: string; axis?: string[]; tips?: string[]; short?: (name: string) => string }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [open, setOpen] = useTipState<number>(ref)
  if (dates.length < 2 || !series.length) return null
  // Viele Linien: höher, damit die Namen rechts nicht gedrängt stehen
  const h = Math.max(210, series.length * 15 + 40)
  const left = 28
  const right = 78
  const top = 10
  const bottom = 24
  const max = Math.max(1, ...series.flatMap((s) => s.values.filter((v): v is number => v != null)))
  const ticks = niceTicks(0, max, 4)
  const top2 = Math.max(max, ticks[ticks.length - 1] ?? max)
  const sx = (i: number) => left + (i / (dates.length - 1)) * (width - left - right)
  const sy = (v: number) => top + (1 - v / top2) * (h - top - bottom)
  const colW = (width - left - right) / (dates.length - 1)
  // Namen am Ende nicht überlappen lassen
  const labels = series
    .map((s, si) => {
      const lastIdx = s.values.map((v, i) => (v != null ? i : -1)).filter((i) => i >= 0).pop()
      return lastIdx == null ? null : { si, y: sy(s.values[lastIdx]!) }
    })
    .filter((x): x is { si: number; y: number } => x != null)
    .sort((a, b) => a.y - b.y)
  for (let k = 1; k < labels.length; k++) if (labels[k].y - labels[k - 1].y < 13) labels[k].y = labels[k - 1].y + 13
  const step = Math.ceil(dates.length / 6)
  const name = (i: number) => (tips ? tips[i] : `nach dem ${formatDate(dates[i])}`)
  const at = open == null ? [] : series.map((s) => ({ s, v: s.values[open] })).filter((x): x is { s: (typeof series)[number]; v: number } => x.v != null).sort((a, b) => b.v - a.v)
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
            <text key={d} x={sx(i)} y={h - 6} textAnchor={i === 0 ? 'start' : i === dates.length - 1 ? 'end' : 'middle'} fill={i === open ? '#F2F4F5' : AXIS} fontSize="10">
              {axis ? axis[i] : formatDate(d).slice(0, 5)}
            </text>
          ) : null,
        )}
        {open != null && <path d={`M${sx(open)} ${top}V${h - bottom}`} stroke="#3A404A" strokeWidth="1.5" />}
        {series.map((s) => {
          const pts = s.values.map((v, i) => (v != null ? ([sx(i), sy(v)] as [number, number]) : null)).filter((p): p is [number, number] => p != null)
          return <path key={s.name} d={linePath(pts)} fill="none" stroke={s.color} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
        })}
        {/* Punkte nur am Ende jeder Linie und in der angetippten Spalte */}
        {series.map((s, si) => {
          const lastIdx = s.values.map((v, i) => (v != null ? i : -1)).filter((i) => i >= 0).pop()
          return [lastIdx, open].map((i, k) =>
            i == null || s.values[i] == null || (k === 1 && i === lastIdx) ? null : <circle key={`${si}-${k}`} cx={sx(i)} cy={sy(s.values[i]!)} r={k === 1 ? 5 : 4} fill={s.color} stroke="#1A1E24" strokeWidth="2" />,
          )
        })}
        {labels.map(({ si, y }) => (
          <g key={series[si].name}>
            <rect x={width - right + 6} y={y - 3} width="6" height="6" rx="1.5" fill={series[si].color} />
            <text x={width - right + 16} y={y + 4} fill="#C5CCD3" fontSize="11" fontWeight="600">
              {short(series[si].name)}
            </text>
          </g>
        ))}
      </svg>
      {dates.map((d, i) => (
        <button
          key={`${d}-${i}`}
          className="hit"
          aria-label={`${name(i)}: ${series
            .map((s) => (s.values[i] != null ? `${s.name} ${fmtV(s.values[i]!)}` : null))
            .filter(Boolean)
            .join(', ')}`}
          style={{ left: sx(i) - colW / 2, top, width: colW, height: h - top - bottom, borderRadius: 6 }}
          onClick={() => setOpen(open === i ? null : i)}
          onPointerEnter={(e) => e.pointerType === 'mouse' && setOpen(i)}
          onPointerLeave={(e) => e.pointerType === 'mouse' && setOpen(null)}
        />
      ))}
      {open != null && at.length > 0 && (
        <Tip
          x={sx(open)}
          y={top}
          above={false}
          width={width}
          tip={{
            title: tips ? tips[open] : formatDate(dates[open]),
            text: (
              <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {at.slice(0, 8).map(({ s, v }) => (
                  <span key={s.name} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ width: 7, height: 7, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{short(s.name)}</span>
                    <b className="num">{fmtV(v)}</b>
                  </span>
                ))}
                {at.length > 8 && <span style={{ color: '#9AA3AD' }}>+ {at.length - 8} weitere</span>}
              </span>
            ),
          }}
        />
      )}
    </div>
  )
}
