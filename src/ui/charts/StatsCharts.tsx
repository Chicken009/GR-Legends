import { formatDate, formatTime, shortName } from '../format'
import { AXIS, GRID, linePath, niceTicks, scale, Tip, useTipState, useWidth } from './common'

/** Rangverlauf (Bump-Chart), Namen rechts. `axis` ersetzt die Datumsbeschriftung (z. B. Läufe eines Wettkampfs). */
export function BumpChart({
  dates,
  series,
  colors,
  me,
  axis,
  short = (n: string) => shortName(n).slice(0, 10),
}: {
  dates: string[]
  series: { name: string; ranks: (number | null)[] }[]
  colors: Map<string, string>
  me: string | null
  axis?: string[]
  /** Kurzname für die Beschriftung rechts (Teams: ganzer Name) */
  short?: (name: string) => string
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const maxRank = Math.max(4, ...series.flatMap((s) => s.ranks.filter((r): r is number => r != null)))
  const rowH = Math.max(10, Math.min(16, 130 / maxRank))
  const height = rowH * (maxRank - 1) + 40
  const labelW = 86
  const sx = scale(0, Math.max(1, dates.length - 1), 8, width - labelW)
  const sy = (r: number) => 10 + (r - 1) * rowH
  const ordered = [...series].sort((a, b) => Number(a.name === me) - Number(b.name === me))
  const labels = series
    .map((s) => ({ s, rank: s.ranks[s.ranks.length - 1] }))
    .filter((x): x is { s: (typeof series)[number]; rank: number } => x.rank != null)
    .sort((a, b) => a.rank - b.rank)
  // Beschriftungen nicht überlappen lassen
  const labelY: number[] = []
  for (const l of labels) labelY.push(Math.max(sy(l.rank), (labelY[labelY.length - 1] ?? -Infinity) + 13))
  const tickIdx = dates.length > 2 ? [0, Math.floor((dates.length - 1) / 2), dates.length - 1] : dates.map((_, i) => i)
  return (
    <div ref={ref} className="chart" style={{ height }}>
      <svg width={width} height={height} role="img" aria-label={`Rangverlauf: ${labels.map((l) => `${l.s.name} Platz ${l.rank}`).join(', ')}`}>
        {Array.from({ length: maxRank }, (_, i) => (
          <path key={i} d={`M0 ${sy(i + 1)}H${width - labelW + 8}`} stroke="#1E2228" />
        ))}
        {ordered.map((s) => {
          const segs: [number, number][][] = []
          let cur: [number, number][] = []
          s.ranks.forEach((r, i) => {
            if (r == null) {
              if (cur.length) segs.push(cur)
              cur = []
            } else cur.push([sx(i), sy(r)])
          })
          if (cur.length) segs.push(cur)
          const isMe = s.name === me
          return (
            <g key={s.name}>
              {segs.map((seg, j) => (
                <path key={j} d={linePath(seg)} fill="none" stroke={colors.get(s.name)} strokeWidth={isMe ? 5 : 3} strokeLinejoin="round" strokeLinecap="round" />
              ))}
              {s.ranks[s.ranks.length - 1] != null && <circle cx={sx(s.ranks.length - 1)} cy={sy(s.ranks[s.ranks.length - 1]!)} r={isMe ? 5.5 : 4} fill={colors.get(s.name)} />}
            </g>
          )
        })}
        {labels.map((l, i) => (
          <text key={l.s.name} x={width - labelW + 12} y={labelY[i] + 4} fill={colors.get(l.s.name)} fontSize="11" fontWeight={l.s.name === me ? 700 : 600}>
            {l.rank} {l.s.name === me ? 'Du' : short(l.s.name)}
          </text>
        ))}
        {tickIdx.map((i) => (
          <text key={i} x={sx(i)} y={height - 2} fill={AXIS} fontSize="10" textAnchor={i === 0 ? 'start' : i === dates.length - 1 ? 'end' : 'middle'}>
            {axis ? axis[i] : `${dates[i].slice(5, 7)}/${dates[i].slice(2, 4)}`}
          </text>
        ))}
      </svg>
    </div>
  )
}

/** Wer schlägt wen? Siege : Niederlagen der Zeile gegen die Spalte */
export function DuelMatrix({ names, h2h, me, onPick }: { names: string[]; h2h: (a: string, b: string) => [number, number]; me: string | null; onPick?: (a: string, b: string) => void }) {
  const ini = (n: string) => (n === me ? 'Du' : n.split(/[\s.]+/).filter(Boolean).map((p) => p[0]).join('').slice(0, 2).toUpperCase())
  return (
    <div role="table" aria-label="Direkte Duelle" style={{ display: 'grid', gridTemplateColumns: `64px repeat(${names.length}, minmax(0, 1fr))`, gap: 4 }}>
      <span role="columnheader" />
      {names.map((n) => (
        <span key={n} role="columnheader" title={n} style={{ fontSize: 11, fontWeight: 700, textAlign: 'center', color: n === me ? 'var(--me)' : 'var(--muted)' }}>
          {ini(n)}
        </span>
      ))}
      {names.map((a) => (
        <div key={a} role="row" style={{ display: 'contents' }}>
          <span role="rowheader" style={{ fontSize: 12, fontWeight: a === me ? 700 : 500, color: a === me ? 'var(--me)' : 'var(--text-2)', display: 'flex', alignItems: 'center', whiteSpace: 'nowrap', overflow: 'hidden' }}>
            {a === me ? 'Du' : shortName(a)}
          </span>
          {names.map((b) => {
            if (a === b) return <span key={b} role="cell" />
            const [w, l] = h2h(a, b)
            const ring = a === me || b === me ? 'inset 0 0 0 1px rgba(59,188,74,.4)' : 'none'
            if (w + l === 0)
              return (
                <span key={b} role="cell" aria-label={`${a} gegen ${b}: kein Duell`} style={{ height: 34, borderRadius: 8, background: '#1A1E24', color: '#4A515C', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, boxShadow: ring }}>
                  –
                </span>
              )
            const share = w / (w + l)
            return (
              <button
                key={b}
                role="cell"
                aria-label={`${a} gegen ${b}: ${w} Siege, ${l} Niederlagen`}
                onClick={() => onPick?.(a, b)}
                style={{
                  height: 34,
                  borderRadius: 8,
                  border: 'none',
                  padding: 0,
                  background: share > 0.5 ? `rgba(59,188,74,${(0.2 + (share - 0.5) * 1.2).toFixed(2)})` : '#262B33',
                  color: share > 0.5 ? '#F2F4F5' : '#9AA3AD',
                  fontSize: 11,
                  fontWeight: 600,
                  fontVariantNumeric: 'tabular-nums',
                  boxShadow: ring,
                }}
              >
                {w}:{l}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

/** Bestzeit und typische Runde pro Renntag (eine Achse, Sekunden) */
export function TrendChart({ days, color }: { days: { date: string; best: number; typical: number | null; bestBy: string }[]; color: string }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [open, setOpen] = useTipState<number>(ref)
  if (days.length < 2) return <p className="muted" style={{ fontSize: 13, margin: 0 }}>Noch zu wenige Renntage.</p>
  const height = 150
  const vals = days.flatMap((d) => [d.best, d.typical ?? d.best])
  const lo = Math.min(...vals) * 0.97
  const hi = Math.max(...vals) * 1.03
  const sx = scale(0, days.length - 1, 34, width - 8)
  const sy = scale(lo, hi, height - 24, 10)
  const ticks = niceTicks(lo / 1000, hi / 1000, 3)
  const bestIdx = days.reduce((b, d, i) => (d.best < days[b].best ? i : b), 0)
  const years = days.map((d, i) => ({ y: d.date.slice(0, 4), i })).filter((x, i, arr) => i === 0 || x.y !== arr[i - 1].y)
  return (
    <div ref={ref} className="chart" style={{ height }}>
      <svg width={width} height={height} role="img" aria-label={`Bestzeit pro Renntag, schnellste ${formatTime(days[bestIdx].best)} am ${formatDate(days[bestIdx].date)}`}>
        {ticks.map((t) => (
          <g key={t}>
            <path d={`M30 ${sy(t * 1000)}H${width}`} stroke={GRID} />
            <text x="0" y={sy(t * 1000) + 3} fill={AXIS} fontSize="10">
              {t.toLocaleString('de-DE', { maximumFractionDigits: 1 })} s
            </text>
          </g>
        ))}
        <path
          d={linePath(days.flatMap((d, i) => (d.typical != null ? [[sx(i), sy(d.typical)] as [number, number]] : [])))}
          fill="none"
          stroke="#6B7480"
          strokeWidth="2"
          strokeDasharray="4 3"
          strokeLinejoin="round"
        />
        <path d={linePath(days.map((d, i) => [sx(i), sy(d.best)]))} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={sx(bestIdx)} cy={sy(days[bestIdx].best)} r="5" fill="url(#gGold)" stroke="#171A1F" strokeWidth="2" />
        {years.map(({ y, i }) => (
          <text key={y} x={sx(i)} y={height - 4} fill={AXIS} fontSize="10" textAnchor={i === 0 ? 'start' : 'middle'}>
            {y}
          </text>
        ))}
      </svg>
      {days.map((d, i) => (
        <button key={d.date} className="hit" style={{ left: sx(i), top: sy(d.best), width: Math.max(14, Math.min(32, width / days.length)), marginLeft: -Math.max(7, Math.min(16, width / days.length / 2)) }} aria-label={`${formatDate(d.date)}: Bestzeit ${formatTime(d.best)}`} onClick={() => setOpen(open === i ? null : i)} onPointerEnter={(e) => e.pointerType === 'mouse' && setOpen(i)} />
      ))}
      {open != null && days[open] && (
        <Tip
          x={sx(open)}
          y={sy(days[open].best)}
          width={width}
          above={sy(days[open].best) > 60}
          tip={{ title: formatTime(days[open].best), text: `${days[open].bestBy}${days[open].typical ? ` · typisch ${formatTime(Math.round(days[open].typical!))}` : ''}`, sub: formatDate(days[open].date), color }}
        />
      )}
    </div>
  )
}

/** Horizontale Balken (HTML) */
export function BarList({ rows, color = '#5B6573', highlight, highlightColor = '#3BBC4A', format = (v) => String(v) }: { rows: { label: string; value: number; key?: string }[]; color?: string; highlight?: string | null; highlightColor?: string; format?: (v: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {rows.map((r) => (
        <div key={r.key ?? r.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, width: 120, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-2)' }}>{r.label}</span>
          <div style={{ flex: 1, height: 12, borderRadius: 6, background: '#22262D', display: 'flex' }}>
            <div style={{ width: `${(r.value / max) * 100}%`, borderRadius: 6, background: r.key === highlight || r.label === highlight ? highlightColor : color }} />
          </div>
          <span className="num" style={{ fontSize: 12, fontWeight: 700, minWidth: 28, textAlign: 'right' }}>
            {format(r.value)}
          </span>
        </div>
      ))}
    </div>
  )
}
