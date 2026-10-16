import { useState, type MouseEvent } from 'react'
import type { RadarAxis } from '../../domain/carProfile'
import { AXIS, GRID, Tip, useWidth } from './common'

export interface RadarSeries {
  name: string
  color: string
  axes: RadarAxis[]
}

/**
 * Netzdiagramm: eine Achse je Eigenschaft, außen = besser. Der gestrichelte Ring in der Mitte ist
 * das durchschnittliche Auto. Antippen irgendwo nahe einer Achse (oder ihrer Beschriftung) zeigt den Messwert.
 */
export function RadarChart({ series, label, size = 320 }: { series: RadarSeries[]; label: string; size?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [open, setOpen] = useState<{ s: number; a: number } | null>(null)
  const axes = series[0]?.axes ?? []
  if (!axes.length) return null
  const w = width
  // Platz für die Beschriftungen links und rechts (ca. 64 px), Höhe passend zum Radius
  const r = Math.max(60, Math.min(size / 2 - 30, (w / 2 - 64) / 1.12))
  const h = Math.round(2 * r + 58)
  const cx = w / 2
  const cy = h / 2 + 6
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / axes.length
  const pt = (i: number, v: number): [number, number] => [cx + Math.cos(angle(i)) * r * v, cy + Math.sin(angle(i)) * r * v]
  const poly = (vals: number[]) => vals.map((v, i) => pt(i, v).map((n) => n.toFixed(1)).join(',')).join(' ')
  const pick = (e: MouseEvent<HTMLDivElement>): { s: number; a: number } | null => {
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const dx = e.clientX - box.left - cx
    const dy = e.clientY - box.top - cy
    const dist = Math.hypot(dx, dy)
    if (dist > r * 1.4) return null
    const step = (2 * Math.PI) / axes.length
    const a = (((Math.round((Math.atan2(dy, dx) + Math.PI / 2) / step) % axes.length) + axes.length) % axes.length)
    let best = 0
    series.forEach((sr, si) => {
      if (Math.abs(sr.axes[a].score * r - dist) < Math.abs(series[best].axes[a].score * r - dist)) best = si
    })
    return { s: best, a }
  }
  const tip = open && series[open.s] ? series[open.s].axes[open.a] : null
  const tipPos = open ? pt(open.a, series[open.s].axes[open.a].score) : null
  return (
    <div ref={ref} className="chart" style={{ height: h, display: 'flex', justifyContent: 'center' }}>
      <div style={{ position: 'relative', width: w, height: h }}>
        <svg width={w} height={h} role="img" aria-label={label}>
          {[0.25, 0.75, 1].map((ring) => (
            <polygon key={ring} points={poly(axes.map(() => ring))} fill="none" stroke={GRID} strokeWidth="1" />
          ))}
          <polygon points={poly(axes.map(() => 0.5))} fill="none" stroke="#3A404A" strokeWidth="1.2" strokeDasharray="4 4" />
          {axes.map((_, i) => {
            const [x, y] = pt(i, 1)
            return <path key={i} d={`M${cx} ${cy}L${x.toFixed(1)} ${y.toFixed(1)}`} stroke={GRID} />
          })}
          {series.map((s) => (
            <polygon key={s.name} points={poly(s.axes.map((a) => a.score))} fill={s.color} fillOpacity={series.length > 1 ? 0.14 : 0.22} stroke={s.color} strokeWidth="2" strokeLinejoin="round" />
          ))}
          {series.map((s, si) =>
            s.axes.map((a, ai) => {
              const [x, y] = pt(ai, a.score)
              const active = open?.s === si && open.a === ai
              return <circle key={`${si}-${ai}`} cx={x} cy={y} r={active ? 6 : 4.5} fill={s.color} stroke="#1A1E24" strokeWidth="2" />
            }),
          )}
          {axes.map((a, i) => {
            const [x, y] = pt(i, 1.17)
            const anchor = Math.abs(x - cx) < 6 ? 'middle' : x < cx ? 'end' : 'start'
            return (
              <text key={a.key} x={x} y={y + 4} fill={AXIS} fontSize="11" fontWeight="600" textAnchor={anchor}>
                {a.label}
              </text>
            )
          })}
          <text x={cx + 4} y={pt(0, 0.5)[1] - 4} fill="#56606B" fontSize="9">
            Ø
          </text>
        </svg>
        {/* große Trefferfläche: nächste Achse zum Finger, bei zwei Autos der nähere Punkt */}
        <div
          aria-hidden="true"
          style={{ position: 'absolute', inset: 0, cursor: 'pointer', touchAction: 'pan-y' }}
          onPointerMove={(e) => e.pointerType === 'mouse' && setOpen(pick(e))}
          onPointerLeave={(e) => e.pointerType === 'mouse' && setOpen(null)}
          onClick={(e) => {
            const p = pick(e)
            setOpen(p && open && p.s === open.s && p.a === open.a ? null : p)
          }}
        />
        {axes.map((a, i) => {
          const [x, y] = pt(i, 1.17)
          return (
            <button
              key={a.key}
              className="hit"
              aria-label={series.map((s) => `${s.name} · ${a.label}: ${s.axes[i].text}`).join(' – ')}
              style={{ left: x - 40, top: y - 14, width: 80, height: 32, borderRadius: 8 }}
              onClick={() => {
                // erneut antippen: nächstes Auto, danach schließen
                const next = open?.a === i ? open.s + 1 : 0
                setOpen(next < series.length ? { s: next, a: i } : null)
              }}
            />
          )
        })}
        {tip && tipPos && open && (
          <Tip x={tipPos[0]} y={tipPos[1]} width={w} above={tipPos[1] > cy} tip={{ title: series.length > 1 ? `${series[open.s].name} · ${tip.label}` : tip.label, text: tip.text, color: series[open.s].color }} />
        )}
      </div>
    </div>
  )
}
