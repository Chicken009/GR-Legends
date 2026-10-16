import { useRef } from 'react'
import { useTipState } from './common'

export interface DonutPart {
  label: string
  value: number
  color: string
}

/** Ringdiagramm für wenige Teile eines Ganzen, Legende mit Werten daneben */
export function DonutChart({ parts, center, sub, label, size = 150 }: { parts: DonutPart[]; center: string; sub: string; label: string; size?: number }) {
  const root = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useTipState<number>(root)
  const total = parts.reduce((a, p) => a + p.value, 0)
  if (!total) return null
  const r = size / 2 - 14
  const cx = size / 2
  const cy = size / 2
  let a0 = -Math.PI / 2
  const arcs = parts.map((p) => {
    const a1 = a0 + (p.value / total) * Math.PI * 2
    const gap = parts.filter((x) => x.value > 0).length > 1 ? 0.03 : 0
    const s0 = a0 + gap
    const s1 = Math.max(s0 + 0.001, a1 - gap)
    const pt = (a: number) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r]
    const [x0, y0] = pt(s0)
    const [x1, y1] = pt(Math.min(s1, s0 + Math.PI * 2 - 0.002))
    a0 = a1
    return { d: `M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 ${s1 - s0 > Math.PI ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`, p }
  })
  const shown = open != null ? parts[open] : null
  return (
    <div ref={root} style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
      <svg width={size} height={size} role="img" aria-label={`${label}: ${parts.map((p) => `${p.label} ${p.value}`).join(', ')}`} style={{ flexShrink: 0 }}>
        {arcs.map(({ d, p }, i) =>
          p.value > 0 ? (
            <path key={p.label} d={d} data-tip-target fill="none" stroke={p.color} strokeWidth={open === i ? 22 : 18} style={{ cursor: 'pointer', transition: 'stroke-width .15s' }} onClick={() => setOpen(open === i ? null : i)} onPointerEnter={(e) => e.pointerType === 'mouse' && setOpen(i)} onPointerLeave={(e) => e.pointerType === 'mouse' && setOpen(null)} />
          ) : null,
        )}
        <text x={cx} y={cy + 2} textAnchor="middle" fill="#F2F4F5" fontSize="24" fontWeight="800">
          {shown ? shown.value : center}
        </text>
        <text x={cx} y={cy + 20} textAnchor="middle" fill="#9AA3AD" fontSize="11">
          {shown ? `${Math.round((shown.value / total) * 100)} % · ${shown.label.length > 14 ? shown.label.slice(0, 13) + '…' : shown.label}` : sub}
        </text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, flex: 1 }}>
        {parts.map((p, i) => (
          <button key={p.label} data-tip-target onClick={() => setOpen(open === i ? null : i)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', padding: 0, textAlign: 'left', color: 'inherit', font: 'inherit', cursor: 'pointer', minWidth: 0 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: p.color, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: open === i ? 'var(--text)' : 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.label}</span>
            <span className="num" style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' }}>{p.value}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
