import { useMemo } from 'react'
import { positionTrace, raceEvents, type RaceEvent } from '../../domain/model'
import type { Result, Session } from '../../types'
import { formatTime, fmtSeconds, shortName } from '../format'
import { AXIS, GRID, linePath, niceTicks, scale, Tip, useTipState, useWidth } from './common'

const key = (r: Result) => r.driver + '#' + r.position

/** Positionsverlauf pro Runde; Überholmanöver, Boxenstopps und Abflüge sind antippbar. */
export function PositionChart({ session, colors, me }: { session: Session; colors: Map<string, string>; me: string | null }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const trace = useMemo(() => positionTrace(session), [session])
  const events = useMemo(() => raceEvents(session), [session])
  const n = session.results.length
  const laps = Math.max(1, ...[...trace.values()].map((v) => v.length))
  const rowH = Math.max(22, Math.min(40, 150 / n))
  const height = rowH * n + 34
  const labelW = Math.min(76, width * 0.24)
  const sx = scale(1, Math.max(2, laps), labelW + 6, width - 8)
  const sy = (pos: number) => 12 + (pos - 1) * rowH
  // Ereignis-Marker: pro Fahrer und Runde einer (Box/Abflug vor Überholen)
  const marks = (() => {
    const seen = new Set<string>()
    const out: { ev: RaceEvent; x: number; y: number; color: string }[] = []
    for (const ev of [...events].sort((a, b) => kindRank(a.kind) - kindRank(b.kind))) {
      const r = session.results.find((x) => x.driver === ev.driver)
      if (!r) continue
      const id = `${ev.driver}|${ev.lap}`
      if (seen.has(id)) continue
      seen.add(id)
      const pos = trace.get(key(r))?.[ev.lap - 1]
      if (pos == null) continue
      out.push({ ev, x: sx(ev.lap), y: sy(pos), color: colors.get(r.driver) ?? '#9AA3AD' })
    }
    return out
  })()
  const [open, setOpen] = useTipState<number>(ref)
  const order = [...session.results].sort((a, b) => Number(a.driver === me) - Number(b.driver === me))
  return (
    <div ref={ref} className="chart" style={{ height }}>
      <svg width={width} height={height} role="img" aria-label={`Positionsverlauf über ${laps} Runden`}>
        {session.results.map((_, i) => (
          <path key={i} d={`M${labelW + 6} ${sy(i + 1)}H${width}`} stroke={GRID} />
        ))}
        {order.map((r) => {
          const t = trace.get(key(r)) ?? []
          const isMe = r.driver === me
          return (
            <path
              key={key(r)}
              d={linePath(t.map((p, i) => [sx(i + 1), sy(p)]))}
              fill="none"
              stroke={colors.get(r.driver)}
              strokeWidth={isMe ? 5.5 : n > 6 ? 2.6 : 4}
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={me && !isMe && n > 4 ? 0.75 : 1}
            />
          )
        })}
        {marks.map((m, i) =>
          m.ev.kind === 'pit' ? (
            <g key={i}>
              <rect x={m.x - 6} y={m.y - 6} width="12" height="12" rx="3" fill="#171A1F" stroke={m.color} strokeWidth="2" />
              <text x={m.x} y={m.y + 3} textAnchor="middle" fill={m.color} fontSize="8" fontWeight="700">
                B
              </text>
            </g>
          ) : m.ev.kind === 'crash' ? (
            <path key={i} d={`M${m.x} ${m.y - 6}l6 6-6 6-6-6z`} fill="#FF6B5A" stroke="#171A1F" strokeWidth="2" />
          ) : (
            <circle key={i} cx={m.x} cy={m.y} r={open === i ? 6.5 : 5} fill={m.color} stroke="#171A1F" strokeWidth="2" />
          ),
        )}
        {session.results.map((r) => (
          <text key={key(r)} x={labelW} y={sy(trace.get(key(r))?.[0] ?? r.position) + 4} textAnchor="end" fill={colors.get(r.driver)} fontSize="11" fontWeight={r.driver === me ? 700 : 600}>
            {shortName(r.driver).slice(0, 11)}
          </text>
        ))}
        <text x={sx(1)} y={height - 4} fill={AXIS} fontSize="10">
          R1
        </text>
        {laps > 4 && (
          <text x={sx(Math.round(laps / 2))} y={height - 4} fill={AXIS} fontSize="10" textAnchor="middle">
            R{Math.round(laps / 2)}
          </text>
        )}
        <text x={sx(laps)} y={height - 4} fill={AXIS} fontSize="10" textAnchor="end">
          R{laps}
        </text>
      </svg>
      {marks.map((m, i) => (
        <button key={i} className="hit" style={{ left: m.x, top: m.y }} aria-label={`Runde ${m.ev.lap}: ${m.ev.text}`} onClick={() => setOpen(open === i ? null : i)} onPointerEnter={(e) => e.pointerType === 'mouse' && setOpen(i)} />
      ))}
      {open != null && marks[open] && (
        <Tip x={marks[open].x} y={marks[open].y} width={width} above={marks[open].y > 40} tip={{ title: `R${marks[open].ev.lap}`, text: marks[open].ev.text, color: marks[open].color }} />
      )}
    </div>
  )
}

const kindRank = (k: RaceEvent['kind']) => (k === 'crash' ? 0 : k === 'pit' ? 1 : k === 'lead' ? 2 : 3)

/** Rundenzeiten eines Fahrers: Verlauf rot (langsam) → grün (schnell), Bestzeit, Abflüge, Boxenstopps. */
export function LapChart({ result, color }: { result: Result; color: string }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [open, setOpen] = useTipState<number>(ref)
  const laps = result.lapTimes.filter((l) => l.status !== 'invalid')
  if (laps.length < 2) return <p className="muted" style={{ fontSize: 13, margin: 0 }}>Zu wenige Runden für ein Diagramm.</p>
  const height = 140
  const ms = laps.map((l) => l.ms)
  const best = Math.min(...ms)
  const normal = laps.filter((l) => l.status === 'normal').map((l) => l.ms)
  // Ausreißer begrenzen, damit saubere Runden lesbar bleiben
  const cap = Math.max(...(normal.length ? normal : ms)) * 1.08
  const lo = best * 0.985
  const hi = Math.max(cap, best * 1.05)
  const sx = scale(laps[0].number, laps[laps.length - 1].number, 34, width - 10)
  const sy = scale(lo, hi, height - 24, 16)
  const y = (v: number) => sy(Math.min(v, hi))
  const ticks = niceTicks(lo / 1000, hi / 1000, 3)
  const pts = laps.map((l) => [sx(l.number), y(l.ms)] as [number, number])
  const gid = `lapg-${result.position}`
  const tipFor = (i: number) => {
    const l = laps[i]
    const kind = l.status === 'crash' ? `Abflug +${fmtSeconds(l.lossMs ?? 0)}` : l.status === 'pit' ? `Boxenstopp +${fmtSeconds(l.lossMs ?? 0)}` : l.ms === best ? 'Bestzeit' : ''
    return { title: `Runde ${l.number}`, text: `${formatTime(l.ms)}${kind ? ` · ${kind}` : ''}` }
  }
  return (
    <div ref={ref} className="chart" style={{ height }}>
      <svg width={width} height={height} role="img" aria-label={`Rundenzeiten ${result.driver}, Bestzeit ${formatTime(best)}`}>
        <defs>
          <linearGradient id={gid} gradientUnits="userSpaceOnUse" x1="0" y1={sy(hi)} x2="0" y2={sy(lo)}>
            <stop offset="0" stopColor="#FF5A4E" />
            <stop offset="0.5" stopColor="#F2C230" />
            <stop offset="1" stopColor="#3BBC4A" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <path d={`M30 ${sy(t * 1000)}H${width}`} stroke={GRID} />
            <text x="0" y={sy(t * 1000) + 3} fill={AXIS} fontSize="10">
              {t.toLocaleString('de-DE', { maximumFractionDigits: 1 })}
            </text>
          </g>
        ))}
        <path d={linePath(pts)} fill="none" stroke={`url(#${gid})`} strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" />
        {laps.map((l, i) => {
          const [cx, cy] = pts[i]
          if (l.status === 'crash') return <path key={i} d={`M${cx} ${cy - 7}l7 7-7 7-7-7z`} fill="#FF6B5A" stroke="#171A1F" strokeWidth="2" />
          if (l.status === 'pit') return <rect key={i} x={cx - 6} y={cy - 6} width="12" height="12" rx="3" fill="#171A1F" stroke="#9AA3AD" strokeWidth="2" />
          if (l.ms === best) return <circle key={i} cx={cx} cy={cy} r="6" fill="#B98CFF" stroke="#171A1F" strokeWidth="2" />
          return laps.length <= 40 ? <circle key={i} cx={cx} cy={cy} r="3.5" fill={color} stroke="#171A1F" strokeWidth="1.5" /> : null
        })}
      </svg>
      {laps.map((l, i) => (
        <button
          key={i}
          className="hit"
          style={{ left: pts[i][0], top: pts[i][1], width: Math.max(16, Math.min(32, width / laps.length)), marginLeft: -Math.max(8, Math.min(16, width / laps.length / 2)) }}
          aria-label={`Runde ${l.number}: ${formatTime(l.ms)}`}
          onClick={() => setOpen(open === i ? null : i)}
          onPointerEnter={(e) => e.pointerType === 'mouse' && setOpen(i)}
        />
      ))}
      {open != null && pts[open] && <Tip x={pts[open][0]} y={pts[open][1]} width={width} tip={tipFor(open)} above={pts[open][1] > 50} />}
    </div>
  )
}
