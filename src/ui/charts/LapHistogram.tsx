import { formatTime } from '../format'
import { AXIS, GRID, niceTicks, scale, Tip, useTipState, useWidth } from './common'

interface Bin {
  from: number
  to: number
  all: number
  mine: number
}

/**
 * Verteilung der sauberen Runden mit einem Auto (Säulen je 0,25 s). Die eigenen Runden sind
 * grün darübergelegt, Bestzeit und typische Runde als Linien.
 */
export function LapHistogram({ laps, mine, color, meColor, best }: { laps: number[]; mine: number[]; color: string; meColor: string; best: number | null }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [open, setOpen] = useTipState<number>(ref)
  if (laps.length < 10) return <p className="muted" style={{ margin: 0, fontSize: 13 }}>Noch zu wenige Runden für ein Diagramm.</p>
  const sorted = [...laps].sort((a, b) => a - b)
  const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))]
  const median = q(0.5)
  // Lange Ausreißer abschneiden, damit der Hauptbereich lesbar bleibt
  const lo = Math.floor(sorted[0] / 250) * 250
  const hi = Math.ceil(q(0.97) / 250) * 250
  const step = Math.max(250, Math.ceil((hi - lo) / 28 / 250) * 250)
  const bins: Bin[] = []
  for (let from = lo; from < hi; from += step) bins.push({ from, to: from + step, all: 0, mine: 0 })
  const binOf = (ms: number) => Math.min(bins.length - 1, Math.max(0, Math.floor((ms - lo) / step)))
  for (const ms of laps) if (ms < hi + step) bins[binOf(ms)].all++
  for (const ms of mine) if (ms < hi + step) bins[binOf(ms)].mine++
  const height = 150
  const top = 14
  const bottom = height - 22
  const left = 4
  const max = Math.max(...bins.map((b) => b.all))
  const sx = scale(lo, lo + bins.length * step, left, width - 4)
  // Oben Platz für die Beschriftungen von Bestzeit und typischer Runde
  const sy = scale(0, max, bottom, top + 18)
  const barW = Math.max(2, sx(lo + step) - sx(lo) - 2)
  const ticks = niceTicks(lo / 1000, (lo + bins.length * step) / 1000, 4)
  const s1 = (ms: number) => (ms / 1000).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (
    <div ref={ref} className="chart" style={{ height }}>
      <svg width={width} height={height} role="img" aria-label={`Verteilung von ${laps.length} sauberen Runden, typisch ${formatTime(Math.round(median))}`}>
        <path d={`M0 ${bottom}H${width}`} stroke={GRID} />
        {bins.map((b, i) => {
          const x = sx(b.from) + 1
          const hAll = bottom - sy(b.all)
          const hMine = bottom - sy(b.mine)
          return (
            <g key={i} opacity={open == null || open === i ? 1 : 0.55}>
              {b.all > 0 && <Bar x={x} h={hAll} w={barW} bottom={bottom} fill={color} />}
              {b.mine > 0 && <Bar x={x} h={hMine} w={barW} bottom={bottom} fill={meColor} />}
            </g>
          )
        })}
        {best != null && best >= lo && (
          <g>
            <path d={`M${sx(best)} ${top - 4}V${bottom}`} stroke="var(--best)" strokeWidth="2" strokeDasharray="3 3" />
            <text x={sx(best) + 4} y={top + 4} fill="var(--best)" fontSize="10" fontWeight="600">
              Best {formatTime(best)}
            </text>
          </g>
        )}
        <path d={`M${sx(median)} ${top + 10}V${bottom}`} stroke="var(--text)" strokeWidth="1.5" strokeDasharray="2 3" opacity="0.6" />
        <text x={Math.min(sx(median) + 4, width - 70)} y={top + 18} fill="var(--text-2)" fontSize="10">
          typisch {s1(median)}
        </text>
        {ticks.map((t) => (
          <text key={t} x={sx(t * 1000)} y={height - 4} fill={AXIS} fontSize="10" textAnchor="middle">
            {t.toLocaleString('de-DE', { maximumFractionDigits: 1 })} s
          </text>
        ))}
      </svg>
      {bins.map((b, i) => (
        <button
          key={i}
          className="hit"
          aria-label={`${s1(b.from)} bis ${s1(b.to)} s: ${b.all} Runden${b.mine ? `, davon ${b.mine} von dir` : ''}`}
          style={{ left: sx(b.from) + barW / 2 + 1, top: (top + bottom) / 2, width: Math.max(14, barW + 2), height: bottom - top, marginLeft: -Math.max(7, barW / 2 + 1), marginTop: -(bottom - top) / 2, borderRadius: 6 }}
          onClick={() => setOpen(open === i ? null : i)}
          onPointerEnter={(e) => e.pointerType === 'mouse' && setOpen(i)}
          onPointerLeave={(e) => e.pointerType === 'mouse' && setOpen(null)}
        />
      ))}
      {open != null && bins[open] && (
        <Tip
          x={sx(bins[open].from) + barW / 2}
          y={sy(bins[open].all)}
          width={width}
          above={sy(bins[open].all) > 60}
          tip={{ title: `${s1(bins[open].from)}–${s1(bins[open].to)} s`, text: `${bins[open].all} Runden${bins[open].mine ? ` · ${bins[open].mine} von dir` : ''}` }}
        />
      )}
    </div>
  )
}

/** Säule mit runder Oberkante, unten gerade auf der Grundlinie */
function Bar({ x, h, w, bottom, fill }: { x: number; h: number; w: number; bottom: number; fill: string }) {
  const r = Math.min(4, w / 2, h)
  return <path d={`M${x} ${bottom}V${bottom - h + r}Q${x} ${bottom - h} ${x + r} ${bottom - h}H${x + w - r}Q${x + w} ${bottom - h} ${x + w} ${bottom - h + r}V${bottom}Z`} fill={fill} />
}
