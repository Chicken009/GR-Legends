import type { Session } from '../../types'
import { formatTime } from '../format'
import { Tip, useTipState, useWidth } from './common'

const BASE = '#1E3A2B'
const HOT = '#C8F0CF'
const CRASH = '#D95926'

const mix = (a: string, b: string, t: number) => {
  const p = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))
  const [x, y] = [p(a), p(b)]
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')
}

/** Farbstufen der Heatmap für die Legende */
export const LAP_HEAT_RAMP = [0, 0.25, 0.5, 0.75, 1].map((t) => mix(BASE, HOT, t))

/**
 * Rundenzeiten-Heatmap: Zeilen = Fahrer (nach Platz), Spalten = Runden. Die Farbe zeigt, wie viel
 * langsamer eine Runde war als die typische saubere Runde des Fahrers in diesem Rennen.
 */
export function LapHeatmap({ session, me }: { session: Session; me: string | null }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [open, setOpen] = useTipState<{ r: number; l: number }>(ref)
  const rows = session.results
  const maxLaps = Math.max(0, ...rows.map((r) => r.lapTimes.length))
  if (!maxLaps) return null
  const left = 92
  const top = 18
  const cell = Math.max(18, Math.min(30, Math.floor((width - left - 4) / maxLaps)))
  const rowH = Math.min(30, cell + 4)
  const w = left + maxLaps * cell + 4
  const h = top + rows.length * (rowH + 4)
  const medians = rows.map((r) => {
    const xs = r.lapTimes.filter((l) => l.status === 'normal').map((l) => l.ms).sort((a, b) => a - b)
    return xs.length ? xs[Math.floor(xs.length / 2)] : null
  })
  const tip = open ? rows[open.r].lapTimes[open.l] : null
  return (
    <div ref={ref} style={{ overflowX: 'auto' }}>
      <div className="chart" style={{ position: 'relative', width: w, height: h }}>
        <svg width={w} height={h} role="img" aria-label={`Rundenzeiten-Heatmap ${session.type} ${session.heat}`}>
          <defs>
            <pattern id="lap-crash" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="#3A1B12" />
              <rect width="3" height="6" fill={CRASH} />
            </pattern>
          </defs>
          {Array.from({ length: maxLaps }, (_, k) =>
            maxLaps <= 15 || (k + 1) % 5 === 0 || k === 0 ? (
              <text key={k} x={left + k * cell + cell / 2} y={11} textAnchor="middle" fill="#6B7480" fontSize="10">
                {k + 1}
              </text>
            ) : null,
          )}
          {rows.map((r, i) => {
            const y = top + i * (rowH + 4)
            const med = medians[i]
            return (
              <g key={r.driver + r.position}>
                <text x={left - 8} y={y + rowH / 2 + 4} textAnchor="end" fill={r.driver === me ? '#3BBC4A' : '#C5CCD3'} fontSize="12" fontWeight="600">
                  {`${r.position}. ${r.driver.length > 10 ? r.driver.slice(0, 9) + '…' : r.driver}`}
                </text>
                {r.lapTimes.map((l, k) => {
                  const dev = med ? (l.ms - med) / med : 0
                  const fill = l.status === 'crash' ? 'url(#lap-crash)' : l.status === 'pit' ? '#EE9E10' : l.status === 'invalid' ? '#2A3038' : mix(BASE, HOT, Math.max(0, Math.min(1, dev / 0.2)))
                  const active = open?.r === i && open.l === k
                  return (
                    <rect
                      key={k}
                      x={left + k * cell + 1.5}
                      y={y}
                      width={cell - 3}
                      height={rowH}
                      rx="5"
                      data-tip-target
                      fill={fill}
                      stroke={active ? '#F2F4F5' : 'none'}
                      strokeWidth="1.5"
                      style={{ cursor: 'pointer' }}
                      onClick={() => setOpen(active ? null : { r: i, l: k })}
                      onPointerEnter={(e) => e.pointerType === 'mouse' && setOpen({ r: i, l: k })}
                      onPointerLeave={(e) => e.pointerType === 'mouse' && setOpen(null)}
                    />
                  )
                })}
              </g>
            )
          })}
        </svg>
        {tip && open && (
          <Tip
            x={left + open.l * cell + cell / 2}
            y={top + open.r * (rowH + 4)}
            width={w}
            above={open.r > 0}
            tip={{
              title: `${rows[open.r].driver} · Runde ${open.l + 1}`,
              text: `${formatTime(tip.ms)} · ${
                tip.status === 'crash' ? `Abflug${tip.lossMs ? ` (+${(tip.lossMs / 1000).toFixed(1)} s)` : ''}` : tip.status === 'pit' ? 'Boxenstopp' : tip.status === 'invalid' ? 'ungültig' : medians[open.r] && tip.ms > medians[open.r]! * 1.01 ? `+${(((tip.ms - medians[open.r]!) / medians[open.r]!) * 100).toFixed(0)} % zur typischen Runde` : 'schnelle Runde'
              }`,
            }}
          />
        )}
      </div>
    </div>
  )
}
