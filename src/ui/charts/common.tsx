import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

/** Breite eines Containers (für responsive SVG-Diagramme) */
export function useWidth<T extends HTMLElement>(fallback = 326) {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(fallback)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setWidth(Math.max(200, Math.round(el.getBoundingClientRect().width)))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

export const scale = (d0: number, d1: number, r0: number, r1: number) => (v: number) => (d1 === d0 ? (r0 + r1) / 2 : r0 + ((v - d0) / (d1 - d0)) * (r1 - r0))

/** Runde Achsenwerte */
export function niceTicks(min: number, max: number, count = 3): number[] {
  if (!isFinite(min) || !isFinite(max)) return []
  if (min === max) return [min]
  const raw = (max - min) / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  const out: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Number(v.toFixed(6)))
  return out
}

export const linePath = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')

export interface TipContent {
  title?: ReactNode
  text: ReactNode
  sub?: ReactNode
  color?: string
}

/** Tooltip über einem Punkt, im Diagramm gehalten */
export function Tip({ x, y, width, tip, above = true }: { x: number; y: number; width: number; tip: TipContent; above?: boolean }) {
  const w = 200
  const left = Math.min(Math.max(x - w / 2, 0), width - w)
  return (
    <div className="tip" role="status" style={{ left, top: above ? undefined : y + 14, bottom: above ? `calc(100% - ${y - 12}px)` : undefined, maxWidth: w }}>
      {tip.title && <span style={{ fontSize: 13, fontWeight: 800, color: tip.color }}>{tip.title}</span>}
      <span style={{ fontSize: 12, color: '#E3E7EB', lineHeight: 1.35 }}>{tip.text}</span>
      {tip.sub && <span style={{ fontSize: 10, color: '#9AA3AD' }}>{tip.sub}</span>}
    </div>
  )
}

export const AXIS = '#6B7480'
export const GRID = '#22262D'
