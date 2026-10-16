import { useState } from 'react'
import { Tip, useWidth } from './common'

export interface MiniItem {
  label: string
  value: number
  /** Klartext im Tooltip, z. B. „3 Rennen“ */
  text: string
}

/** Kleine Balken ohne Achsen, Balken antippen zeigt den Wert */
export function MiniBars({ items, color, height = 56, label }: { items: MiniItem[]; color: string; height?: number; label: string }) {
  const [ref, width] = useWidth<HTMLDivElement>(260)
  const [open, setOpen] = useState<number | null>(null)
  if (!items.length) return null
  const max = Math.max(1, ...items.map((i) => i.value))
  const gap = 4
  const bw = Math.max(6, Math.min(34, (width - gap * (items.length - 1)) / items.length))
  const total = items.length * bw + (items.length - 1) * gap
  const x0 = (width - total) / 2
  return (
    <div ref={ref} className="chart" style={{ height, position: 'relative' }}>
      <svg width={width} height={height} role="img" aria-label={`${label}: ${items.map((i) => `${i.label} ${i.text}`).join(', ')}`}>
        {items.map((it, i) => {
          const h = it.value > 0 ? Math.max(4, (it.value / max) * (height - 6)) : 2
          const x = x0 + i * (bw + gap)
          return (
            <g key={i}>
              <rect x={x} y={height - h} width={bw} height={h} rx={Math.min(4, bw / 2)} fill={it.value > 0 ? color : '#3A404A'} opacity={open == null || open === i ? 1 : 0.45} />
              <rect
                x={x - gap / 2}
                y={0}
                width={bw + gap}
                height={height}
                fill="transparent"
                style={{ cursor: 'pointer' }}
                onClick={() => setOpen(open === i ? null : i)}
                onMouseEnter={() => setOpen(i)}
                onMouseLeave={() => setOpen(null)}
              />
            </g>
          )
        })}
      </svg>
      {open != null && items[open] && <Tip x={x0 + open * (bw + gap) + bw / 2} y={4} width={width} above={false} tip={{ title: items[open].label, text: items[open].text }} />}
    </div>
  )
}

/** Kleine Linie ohne Achsen; `invert`: kleiner ist besser (z. B. Rundenzeiten) und steht oben */
export function MiniLine({ items, color, height = 64, invert = false, label }: { items: MiniItem[]; color: string; height?: number; invert?: boolean; label: string }) {
  const [ref, width] = useWidth<HTMLDivElement>(260)
  const [open, setOpen] = useState<number | null>(null)
  if (items.length < 2) return null
  const vals = items.map((i) => i.value)
  const lo = Math.min(...vals)
  const hi = Math.max(...vals)
  const x = (i: number) => 8 + (i / (items.length - 1)) * (width - 16)
  const y = (v: number) => {
    const t = (v - lo) / (hi - lo || 1)
    return 8 + (invert ? t : 1 - t) * (height - 16)
  }
  const d = items.map((it, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(it.value).toFixed(1)}`).join(' ')
  const hitW = Math.max(14, (width - 16) / items.length)
  return (
    <div ref={ref} className="chart" style={{ height, position: 'relative' }}>
      <svg width={width} height={height} role="img" aria-label={label}>
        <path d={d} fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
        {items.map((it, i) => (
          <circle key={i} cx={x(i)} cy={y(it.value)} r={open === i ? 5 : i === items.length - 1 ? 3.5 : 2.5} fill={color} stroke="#14181D" strokeWidth="1.5" />
        ))}
      </svg>
      {items.map((it, i) => (
        <button
          key={i}
          className="hit"
          aria-label={`${it.label}: ${it.text}`}
          style={{ left: x(i) - hitW / 2, top: 0, width: hitW, height, borderRadius: 6 }}
          onClick={() => setOpen(open === i ? null : i)}
          onMouseEnter={() => setOpen(i)}
          onMouseLeave={() => setOpen(null)}
        />
      ))}
      {open != null && items[open] && <Tip x={x(open)} y={y(items[open].value)} width={width} above={y(items[open].value) > height / 2} tip={{ title: items[open].label, text: items[open].text }} />}
    </div>
  )
}
