import { useRef } from 'react'
import { useTipState } from './common'

export interface DonutPart {
  label: string
  value: number
  color: string
}

/** Ringdiagramm für wenige Teile eines Ganzen, Legende mit Werten daneben */
/**
 * `labeled`: Ring mittig, Name und Wert direkt neben dem jeweiligen Abschnitt statt einer Legende –
 * gut für wenige Teile (z. B. die Mitglieder eines Teams).
 */
export function DonutChart({ parts, center, sub, label, size = 150, format = String, labeled = false }: { parts: DonutPart[]; center: string; sub: string; label: string; size?: number; format?: (v: number) => string; labeled?: boolean }) {
  const root = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useTipState<number>(root)
  const total = parts.reduce((a, p) => a + p.value, 0)
  if (!total) return null
  const r = size / 2 - 14
  // Mit Beschriftung: links und rechts Platz für Namen
  const side = labeled ? 96 : 0
  const cx = size / 2 + side
  const cy = size / 2 + (labeled ? 10 : 0)
  const svgW = size + side * 2
  const svgH = size + (labeled ? 20 : 0)
  let a0 = -Math.PI / 2
  const arcs = parts.map((p) => {
    const a1 = a0 + (p.value / total) * Math.PI * 2
    const gap = parts.filter((x) => x.value > 0).length > 1 ? (labeled ? 0.05 : 0.03) : 0
    const s0 = a0 + gap
    const s1 = Math.max(s0 + 0.001, a1 - gap)
    const pt = (a: number) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r]
    const [x0, y0] = pt(s0)
    const [x1, y1] = pt(Math.min(s1, s0 + Math.PI * 2 - 0.002))
    a0 = a1
    return { d: `M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 ${s1 - s0 > Math.PI ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`, p, mid: (s0 + s1) / 2 }
  })
  const shown = open != null ? parts[open] : null
  return (
    <div ref={root} style={{ display: 'flex', alignItems: 'center', justifyContent: labeled ? 'center' : undefined, gap: 14, flexWrap: 'wrap' }}>
      <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} style={{ flexShrink: 0, maxWidth: '100%', height: 'auto' }} role="img" aria-label={`${label}: ${parts.map((p) => `${p.label} ${format(p.value)}`).join(', ')}`}>
        {arcs.map(({ d, p }, i) =>
          p.value > 0 ? (
            <path key={p.label} d={d} data-tip-target fill="none" stroke={p.color} strokeWidth={open === i ? 22 : 18} style={{ cursor: 'pointer', transition: 'stroke-width .15s' }} onClick={() => setOpen(open === i ? null : i)} onPointerEnter={(e) => e.pointerType === 'mouse' && setOpen(i)} onPointerLeave={(e) => e.pointerType === 'mouse' && setOpen(null)} />
          ) : null,
        )}
        {labeled &&
          arcs.map(({ p, mid }) => {
            if (p.value <= 0) return null
            const lx = cx + Math.cos(mid) * (r + 18)
            const ly = cy + Math.sin(mid) * (r + 18)
            const anchor = Math.cos(mid) > 0.25 ? 'start' : Math.cos(mid) < -0.25 ? 'end' : 'middle'
            const short = p.label.length > 13 ? p.label.slice(0, 12) + '…' : p.label
            return (
              <g key={`l-${p.label}`}>
                <text x={lx} y={ly - 2} textAnchor={anchor} fill={p.color} fontSize="12" fontWeight="700">
                  {short}
                </text>
                <text x={lx} y={ly + 12} textAnchor={anchor} fill="#9AA3AD" fontSize="11">
                  {format(p.value)} · {Math.round((p.value / total) * 100)} %
                </text>
              </g>
            )
          })}
        <text x={cx} y={cy + 2} textAnchor="middle" fill="#F2F4F5" fontSize="24" fontWeight="800">
          {shown ? format(shown.value) : center}
        </text>
        <text x={cx} y={cy + 20} textAnchor="middle" fill="#9AA3AD" fontSize="11">
          {shown ? `${Math.round((shown.value / total) * 100)} % · ${shown.label.length > 14 ? shown.label.slice(0, 13) + '…' : shown.label}` : sub}
        </text>
      </svg>
      {!labeled && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, flex: 1 }}>
        {parts.map((p, i) => (
          <button key={p.label} data-tip-target onClick={() => setOpen(open === i ? null : i)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', padding: 0, textAlign: 'left', color: 'inherit', font: 'inherit', cursor: 'pointer', minWidth: 0 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: p.color, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: open === i ? 'var(--text)' : 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.label}</span>
            <span className="num" style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' }}>{format(p.value)}</span>
          </button>
        ))}
      </div>
      )}
    </div>
  )
}
